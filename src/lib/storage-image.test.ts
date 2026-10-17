/**
 * Resize-on-write tests (R2 swap, commit 3). Generates input images with
 * `sharp` itself so no binary fixtures are committed.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  ITEM_MAX_WIDTH_PX,
  LOGO_SIZE_PX,
  processItemImage,
  processLogoImage,
} from "./storage-image";

async function makePng(width: number, height: number): Promise<Uint8Array> {
  const out = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(out);
}

describe("processLogoImage", () => {
  it("produces a 256 px square WebP", async () => {
    const input = await makePng(800, 600);
    const out = await processLogoImage(input);
    expect(out.extension).toBe("webp");
    expect(out.mimeType).toBe("image/webp");
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(LOGO_SIZE_PX);
    expect(meta.height).toBe(LOGO_SIZE_PX);
    expect(out.bytes.length).toBeLessThan(input.length);
  });
});

describe("processItemImage", () => {
  it("caps wide photos at 1280 px and encodes WebP", async () => {
    const input = await makePng(2000, 1000);
    const out = await processItemImage(input);
    expect(out.extension).toBe("webp");
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(ITEM_MAX_WIDTH_PX);
    expect(meta.height).toBe(640);
  });

  it("never enlarges small photos", async () => {
    const input = await makePng(400, 300);
    const out = await processItemImage(input);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });
});
