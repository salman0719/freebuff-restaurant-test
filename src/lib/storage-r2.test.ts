/**
 * R2 driver contract suite (R2 swap, commit 1). Live: opt-in on the four
 * `R2_*` vars (same names as `.env.example` and Vercel env) — otherwise
 * the suite skips so CI (no bucket) stays green.
 *
 * Runs the same round-trip contract as the fs suite (`storage.test.ts`):
 * store, read, delete within the shared key shape, plus invalid-key and
 * miss handling. Keys use a random tenant id per run and are removed
 * afterwards; nothing outside the run's keys is touched.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildObjectKey, isValidObjectKey } from "./storage-keys";
import { deleteObjectR2, getObjectR2, putObjectR2 } from "./storage-r2";

const hasR2 =
  Boolean(process.env.R2_ACCOUNT_ID) &&
  Boolean(process.env.R2_BUCKET) &&
  Boolean(process.env.R2_ACCESS_KEY_ID) &&
  Boolean(process.env.R2_SECRET_ACCESS_KEY);

const live = hasR2 ? describe : describe.skip;

function pngBytes(extra = 100): Uint8Array {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return new Uint8Array([...header, ...new Array(extra).fill(0)]);
}

live("R2 object round-trip (live bucket)", () => {
  it("stores, reads, and deletes within the shared key shape", async () => {
    const tenantId = randomUUID();
    const key = buildObjectKey("items", tenantId, "png");
    expect(isValidObjectKey(key)).toBe(true);
    const bytes = pngBytes();
    await putObjectR2(key, bytes);
    try {
      const read = await getObjectR2(key);
      expect(read?.mimeType).toBe("image/png");
      expect(Array.from(read?.bytes ?? [])).toEqual(Array.from(bytes));
    } finally {
      await deleteObjectR2(key);
    }
    expect(await getObjectR2(key)).toBeNull();
    // Deleting twice is fine (idempotent cleanup).
    await deleteObjectR2(key);
  });

  it("refuses invalid keys and misses without throwing", async () => {
    await expect(putObjectR2("../escape.png", pngBytes())).rejects.toThrow();
    expect(await getObjectR2("../escape.png")).toBeNull();
    expect(await getObjectR2(buildObjectKey("items", randomUUID(), "png"))).toBeNull();
  });
});
