/**
 * Object storage (Phase 3.6). Server-only: touches the file system.
 *
 * Driver decision: 0002 §5 targets Cloudflare R2 behind an
 * `upload`/`delete`/`getPublicUrl` adapter, but R2 needs an account,
 * keys, and a new SDK — none of which the MVP has. This local-filesystem
 * driver implements the same shape (provider-neutral keys in the
 * database, server-owned key generation, explicit delete) so the R2 move
 * swaps this module, not the callers. Local files are dev-only: they live
 * under `STORAGE_DIR` (default `local/uploads`, git-ignored) and never
 * deploy anywhere.
 *
 * Trust model: nothing user-supplied reaches the disk. Keys are built
 * here from the tenant id plus a random id (`tenants/{uuid}/logos|items/
 * {uuid}.{ext}`), extensions come from the sniffed bytes — never the
 * uploaded filename — and every read/write re-validates the key against
 * a strict pattern, so traversal is structurally impossible. Uploaded
 * bytes are validated (type allowlist, 2 MB cap, magic-byte sniff
 * matching the declared MIME) before anything is stored.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { err, ok, type ServiceResult } from "./result";

/** Largest accepted upload: 2 MB. Phone originals must be downsized first. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Uploadable types with their server-chosen extensions. */
const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ImageMimeType = keyof typeof IMAGE_TYPES;

const MAGIC: { mime: ImageMimeType; prefix: number[]; offset8?: number[] }[] = [
  { mime: "image/jpeg", prefix: [0xff, 0xd8, 0xff] },
  { mime: "image/png", prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WebP: "RIFF" at 0, "WEBP" at 8.
  { mime: "image/webp", prefix: [0x52, 0x49, 0x46, 0x46], offset8: [0x57, 0x45, 0x42, 0x50] },
];

function sniffMime(bytes: Uint8Array): ImageMimeType | null {
  for (const { mime, prefix, offset8 } of MAGIC) {
    if (!prefix.every((byte, index) => bytes[index] === byte)) continue;
    if (offset8 && !offset8.every((byte, index) => bytes[8 + index] === byte)) continue;
    return mime;
  }
  return null;
}

export interface ParsedImage {
  bytes: Uint8Array;
  mimeType: ImageMimeType;
  extension: string;
  size: number;
}

function imageError(message: string): ServiceResult<ParsedImage> {
  return err("VALIDATION_FAILED", "Invalid image.", { image: [message] });
}

/**
 * Validate an upload without storing anything: must be a non-empty File,
 * within the size cap, with a declared type on the allowlist whose magic
 * bytes agree (a renamed `.exe` fails the sniff, not just the label).
 */
export async function parseImageUpload(file: unknown): Promise<ServiceResult<ParsedImage>> {
  if (typeof File === "undefined" || !(file instanceof File)) {
    return imageError("Choose an image file to upload.");
  }
  if (file.size === 0) {
    return imageError("The chosen file is empty.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return imageError("Images must be at most 2 MB.");
  }
  if (!(file.type in IMAGE_TYPES)) {
    return imageError("Images must be JPEG, PNG, or WebP.");
  }
  const declared = file.type as ImageMimeType;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniffMime(bytes) !== declared) {
    return imageError("The file contents do not match its image type.");
  }
  return ok({ bytes, mimeType: declared, extension: IMAGE_TYPES[declared], size: file.size });
}

/** Storage root, overridable for tests (`STORAGE_DIR`). Read per call. */
export function storageDir(): string {
  return resolve(process.cwd(), process.env.STORAGE_DIR ?? join("local", "uploads"));
}

const KEY_PATTERN = /^tenants\/[0-9a-f-]{36}\/(logos|items)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Strict allowlist: only keys this module could have generated. */
export function isValidObjectKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Build the key for an upload. The tenant prefix keeps ownership evident
 * (and future R2 prefix policies trivial); the random tail keeps URLs
 * unguessable and ignores the user-supplied filename entirely.
 */
export function buildObjectKey(
  kind: "logos" | "items",
  tenantId: string,
  extension: string
): string {
  return `tenants/${tenantId}/${kind}/${randomUUID()}.${extension}`;
}

function pathForKey(key: string): string {
  if (!isValidObjectKey(key)) {
    throw new Error("Invalid object key.");
  }
  const full = resolve(storageDir(), key);
  if (!full.startsWith(storageDir() + sep)) {
    throw new Error("Invalid object key.");
  }
  return full;
}

/** Store validated bytes. Throws on invalid keys or I/O failures. */
export async function putObject(key: string, bytes: Uint8Array): Promise<void> {
  const full = pathForKey(key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

/** Read bytes plus their MIME type, or `null` when absent/invalid. */
export async function getObject(key: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  let full: string;
  try {
    full = pathForKey(key);
  } catch {
    return null;
  }
  const extension = full.slice(full.lastIndexOf(".") + 1);
  const mimeType = Object.entries(IMAGE_TYPES).find(([, ext]) => ext === extension)?.[0] ?? null;
  if (!mimeType) return null;
  try {
    return { bytes: await readFile(full), mimeType };
  } catch {
    return null;
  }
}

/** Remove an object; missing files are fine (idempotent cleanup). */
export async function deleteObject(key: string): Promise<void> {
  let full: string;
  try {
    full = pathForKey(key);
  } catch {
    return;
  }
  try {
    await unlink(full);
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error;
  }
}
