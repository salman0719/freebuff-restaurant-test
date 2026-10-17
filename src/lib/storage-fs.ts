/**
 * Local-filesystem storage driver (R2 swap, commit 1). Dev-only: files live
 * under `STORAGE_DIR` (default `local/uploads`, git-ignored) and never
 * deploy anywhere. Production uses the R2 driver (`./storage-r2.ts`);
 * selection lives in `./storage.ts`.
 *
 * Trust model: every read/write re-validates the key against the shared
 * allowlist (`./storage-keys.ts`) plus a contained-resolve check, so
 * traversal is structural.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { isValidObjectKey } from "./storage-keys";

/** Uploadable types with their server-chosen extensions. */
const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

/**
 * Storage root, overridable for tests (`STORAGE_DIR`). Read per call.
 *
 * Dev-only driver: never on the production request path (see
 * `./storage.ts` dynamic fallback). The inline `turbopackIgnore` markers
 * are the documented opt-out for Turbopack's whole-project trace (see
 * `docs/tech-debt/turbopack-storage-tracing.md`); the strict key
 * allowlist + contained-resolve guard below survive any driver.
 */
export function storageDir(): string {
  return resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    process.env.STORAGE_DIR ?? join("local", "uploads")
  );
}

function pathForKey(key: string): string {
  if (!isValidObjectKey(key)) {
    throw new Error("Invalid object key.");
  }
  const full = resolve(/*turbopackIgnore: true*/ storageDir(), key);
  if (!full.startsWith(storageDir() + sep)) {
    throw new Error("Invalid object key.");
  }
  return full;
}

/** Store validated bytes. Throws on invalid keys or I/O failures. */
export async function putObjectFs(key: string, bytes: Uint8Array): Promise<void> {
  const full = pathForKey(key);
  await mkdir(/*turbopackIgnore: true*/ dirname(full), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ full, bytes);
}

/** Read bytes plus their MIME type, or `null` when absent/invalid. */
export async function getObjectFs(
  key: string
): Promise<{ bytes: Buffer; mimeType: string } | null> {
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
    return { bytes: await readFile(/*turbopackIgnore: true*/ full), mimeType };
  } catch {
    return null;
  }
}

/** Remove an object; missing files are fine (idempotent cleanup). */
export async function deleteObjectFs(key: string): Promise<void> {
  let full: string;
  try {
    full = pathForKey(key);
  } catch {
    return;
  }
  try {
    await unlink(/*turbopackIgnore: true*/ full);
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error;
  }
}

/** Liveness probe for the fs driver: the root is writable. */
export async function probeStorageFs(): Promise<void> {
  await mkdir(/*turbopackIgnore: true*/ storageDir(), { recursive: true });
}
