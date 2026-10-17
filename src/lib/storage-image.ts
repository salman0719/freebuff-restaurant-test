/**
 * Resize-on-write (R2 swap, commit 3). Server-only: uses `sharp` on the
 * Next.js server (native binaries, fine on Vercel functions).
 *
 * Phone originals are stored, display sizes are served — so resize during
 * upload, before `putObject`:
 * - logos → square at most 256 px (rendered at 96–112 px, DPR 2 headroom).
 * - item photos → at most 1280 px wide, aspect preserved, never enlarged.
 * Both encode WebP (the 6.3 performance pass measured WebP as smaller and
 * faster than AVIF on this content).
 *
 * The stored key shape stays as is (`tenants/{uuid}/logos|items/{uuid}.webp`),
 * so callers, the serving route, and the isolation tests do not change.
 * The 2 MB upload cap stays as the input guard in `parseImageUpload`;
 * stored bytes drop well below it.
 */
import sharp from "sharp";

export const LOGO_SIZE_PX = 256;
export const ITEM_MAX_WIDTH_PX = 1280;

export interface ProcessedImage {
  bytes: Uint8Array;
  extension: "webp";
  mimeType: "image/webp";
}

/**
 * Resize a validated logo upload to a 256 px square, encoded WebP.
 * Throws on undecodable input (caller maps to `INTERNAL`, never a crash).
 */
export async function processLogoImage(bytes: Uint8Array): Promise<ProcessedImage> {
  const out = await sharp(bytes)
    .resize(LOGO_SIZE_PX, LOGO_SIZE_PX, { fit: "cover" })
    .webp({ quality: 80 })
    .toBuffer();
  return { bytes: new Uint8Array(out), extension: "webp", mimeType: "image/webp" };
}

/**
 * Resize a validated item-photo upload to at most 1280 px wide, encoded
 * WebP. Smaller images are never enlarged.
 */
export async function processItemImage(bytes: Uint8Array): Promise<ProcessedImage> {
  const out = await sharp(bytes)
    .resize({ width: ITEM_MAX_WIDTH_PX, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return { bytes: new Uint8Array(out), extension: "webp", mimeType: "image/webp" };
}
