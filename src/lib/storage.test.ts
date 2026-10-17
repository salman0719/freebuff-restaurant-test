import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildObjectKey,
  deleteObject,
  getObject,
  isValidObjectKey,
  MAX_IMAGE_BYTES,
  parseImageUpload,
  putObject,
  resolveStorageDriver,
} from "./storage";
import { storageDir } from "./storage-fs";
import { imageUrlForKey } from "./image-url";

const TENANT_ID = "00000000-0000-0000-0000-000000000000";

function pngBytes(extra = 100): Uint8Array {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return new Uint8Array([...header, ...new Array(extra).fill(0)]);
}

function file(name: string, type: string, bytes: Uint8Array): File {
  return new File([bytes as BlobPart], name, { type });
}

describe("parseImageUpload", () => {
  it("accepts a PNG whose magic matches its type", async () => {
    const result = await parseImageUpload(file("logo.png", "image/png", pngBytes()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.extension).toBe("png");
      expect(result.data.mimeType).toBe("image/png");
    }
  });

  it("rejects a renamed executable behind a PNG label", async () => {
    const bytes = new Uint8Array([0x4d, 0x5a, ...new Array(100).fill(0)]);
    const result = await parseImageUpload(file("evil.png", "image/png", bytes));
    expect(result.ok).toBe(false);
  });

  it("rejects disallowed types, empties, oversize, and non-files", async () => {
    const gif = await parseImageUpload(file("a.gif", "image/gif", pngBytes()));
    expect(gif.ok).toBe(false);
    const empty = await parseImageUpload(file("e.png", "image/png", new Uint8Array(0)));
    expect(empty.ok).toBe(false);
    const big = await parseImageUpload(
      file("b.png", "image/png", new Uint8Array(MAX_IMAGE_BYTES + 1))
    );
    expect(big.ok).toBe(false);
    const text = await parseImageUpload("not a file");
    expect(text.ok).toBe(false);
    for (const result of [gif, empty, big, text]) {
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_FAILED");
        expect(Object.keys(result.error.fields ?? {})).toEqual(["image"]);
      } else {
        expect.unreachable();
      }
    }
  });
});

describe("object keys", () => {
  it("builds tenant-scoped random keys and ignores filenames", () => {
    const first = buildObjectKey("logos", TENANT_ID, "png");
    const second = buildObjectKey("logos", TENANT_ID, "png");
    expect(first).not.toBe(second);
    expect(isValidObjectKey(first)).toBe(true);
    expect(isValidObjectKey("tenants/abc/logos/x.png")).toBe(false);
    expect(isValidObjectKey("tenants/" + TENANT_ID + "/logos/../../../etc.png")).toBe(false);
    expect(isValidObjectKey("tenants/" + TENANT_ID + "/logos/x.exe")).toBe(false);
  });

  it("builds public URLs without trusting key segments", () => {
    expect(imageUrlForKey(`tenants/${TENANT_ID}/logos/abc.png`)).toBe(
      `/api/images/tenants/${TENANT_ID}/logos/abc.png`
    );
  });
});

describe("storage driver selection", () => {
  it("prefers an explicit STORAGE_DRIVER and defaults to r2 when R2_ACCOUNT_ID is set", async () => {
    const previousDriver = process.env.STORAGE_DRIVER;
    const previousAccount = process.env.R2_ACCOUNT_ID;
    try {
      process.env.STORAGE_DRIVER = "fs";
      delete process.env.R2_ACCOUNT_ID;
      expect(resolveStorageDriver()).toBe("fs");
      process.env.STORAGE_DRIVER = "r2";
      expect(resolveStorageDriver()).toBe("r2");
      delete process.env.STORAGE_DRIVER;
      process.env.R2_ACCOUNT_ID = "abc123";
      expect(resolveStorageDriver()).toBe("r2");
      delete process.env.R2_ACCOUNT_ID;
      expect(resolveStorageDriver()).toBe("fs");
    } finally {
      if (previousDriver === undefined) delete process.env.STORAGE_DRIVER;
      else process.env.STORAGE_DRIVER = previousDriver;
      if (previousAccount === undefined) delete process.env.R2_ACCOUNT_ID;
      else process.env.R2_ACCOUNT_ID = previousAccount;
    }
  });
});

describe("object round-trip", () => {
  let dir = "";
  let previousDriver: string | undefined;
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    delete process.env.STORAGE_DIR;
    if (previousDriver === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = previousDriver;
  });

  it("stores, reads, and deletes within an isolated root", async () => {
    previousDriver = process.env.STORAGE_DRIVER;
    process.env.STORAGE_DRIVER = "fs";
    dir = await mkdtemp(join(tmpdir(), "storage-test-"));
    process.env.STORAGE_DIR = dir;
    expect(storageDir()).toBe(dir);
    const key = buildObjectKey("items", TENANT_ID, "png");
    const bytes = pngBytes();
    await putObject(key, bytes);
    const read = await getObject(key);
    expect(read?.mimeType).toBe("image/png");
    expect(Array.from(read?.bytes ?? [])).toEqual(Array.from(bytes));
    await deleteObject(key);
    expect(await getObject(key)).toBeNull();
    // Deleting twice is fine (idempotent cleanup).
    await deleteObject(key);
  });

  it("refuses invalid keys and misses without throwing", async () => {
    await expect(putObject("../escape.png", pngBytes())).rejects.toThrow();
    expect(await getObject("../escape.png")).toBeNull();
    expect(await getObject(buildObjectKey("items", TENANT_ID, "png"))).toBeNull();
  });
});
