/**
 * Object storage selector (R2 swap, commits 1–2). Server-only: delegates
 * to a driver, never touches bytes itself.
 *
 * Drivers share the provider-neutral key shape (`./storage-keys.ts`) and
 * the adapter signatures (`putObject` / `getObject` / `deleteObject`), so
 * the database, the capability-URL serving route, and the
 * tenant-isolation suite are untouched by the swap:
 * - `./storage-fs.ts` — local filesystem (dev-only, git-ignored).
 * - `./storage-r2.ts` — Cloudflare R2 via the S3-compatible API (hosted).
 *
 * Selection: `STORAGE_DRIVER=fs|r2`, defaulting to `r2` when
 * `R2_ACCOUNT_ID` is present and `fs` otherwise, so local dev keeps
 * working with zero setup and deployed environments are R2 by
 * construction. A missing R2 config in a deployed environment fails the
 * upload loudly (thrown error → `INTERNAL` in `tenant-data.ts`), never
 * silently. The bucket stays private; serving flows through
 * `/api/images/[...key]`.
 *
 * Trust model: nothing user-supplied reaches storage. Keys are built in
 * `./storage-keys.ts` from the tenant id plus a random id, extensions come
 * from the sniffed bytes — never the uploaded filename — and every
 * read/write re-validates the key, so traversal is structurally
 * impossible. Uploaded bytes are validated (type allowlist, 2 MB cap,
 * magic-byte sniff matching the declared MIME) before anything is stored.
 */
import { err, ok, type ServiceResult } from "./result";
import { buildObjectKey, isValidObjectKey } from "./storage-keys";
import {
  deleteObjectR2,
  getObjectR2,
  isR2Configured,
  probeStorageR2,
  putObjectR2,
} from "./storage-r2";

export { buildObjectKey, isValidObjectKey };
export { isR2Configured };

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

export type StorageDriver = "fs" | "r2";

/**
 * Driver selection: explicit `STORAGE_DRIVER` wins, otherwise `r2` when
 * `R2_ACCOUNT_ID` is present and `fs` otherwise. Read per call so tests
 * can pin a driver via the environment.
 */
export function resolveStorageDriver(): StorageDriver {
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === "fs" || explicit === "r2") return explicit;
  return process.env.R2_ACCOUNT_ID ? "r2" : "fs";
}
/**
 * Dev-only fs fallback, reachable only behind the driver selector. Dynamic
 * import keeps `node:fs` (and its whole-project Turbopack trace — see
 * `docs/tech-debt/turbopack-storage-tracing.md`) out of the production
 * route graph: deployed environments are R2 by construction, so no
 * production bundle statically includes the fs driver.
 */
async function fsDriver() {
  return import("./storage-fs");
}

/** Store validated bytes via the selected driver. Throws on invalid keys or I/O failures. */
export async function putObject(key: string, bytes: Uint8Array): Promise<void> {
  if (resolveStorageDriver() === "r2") {
    await putObjectR2(key, bytes);
    return;
  }
  const { putObjectFs } = await fsDriver();
  await putObjectFs(key, bytes);
}

/** Read bytes plus their MIME type via the selected driver, or `null` when absent/invalid. */
export async function getObject(key: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (resolveStorageDriver() === "r2") {
    return getObjectR2(key);
  }
  const { getObjectFs } = await fsDriver();
  return getObjectFs(key);
}

/** Remove an object via the selected driver; missing objects are fine (idempotent cleanup). */
export async function deleteObject(key: string): Promise<void> {
  if (resolveStorageDriver() === "r2") {
    await deleteObjectR2(key);
    return;
  }
  const { deleteObjectFs } = await fsDriver();
  await deleteObjectFs(key);
}

/** Liveness probe for the selected driver (health route). */
export async function probeStorage(): Promise<void> {
  if (resolveStorageDriver() === "r2") {
    await probeStorageR2();
    return;
  }
  const { probeStorageFs } = await fsDriver();
  await probeStorageFs();
}
