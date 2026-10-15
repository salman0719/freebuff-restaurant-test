/**
 * Public image route tests (Phase 6.1). Until now nothing tested this
 * handler, and it is the one route that serves bytes a tenant uploaded to
 * anonymous visitors.
 *
 * The route is unauthenticated by design — capability URLs: keys are
 * server-generated random ids, learnable only from a tenant's own pages. So
 * what matters is what it REFUSES (anything that is not a stored key,
 * including traversal and every non-image path) and the headers it promises.
 * The security headers are pinned here because they are the layer that does
 * not depend on upload validation having been perfect.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildObjectKey, putObject } from "@/lib/storage";
import { GET } from "./route";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe("GET /api/images/[...key]", () => {
  let dir = "";
  let previousStorageDir: string | undefined;
  let logoKey = "";

  async function get(key: string[]): Promise<Response> {
    return GET(new Request("http://localhost/api/images/probe"), {
      params: Promise.resolve({ key }),
    });
  }

  beforeAll(async () => {
    previousStorageDir = process.env.STORAGE_DIR;
    dir = await mkdtemp(join(tmpdir(), "img-route-"));
    process.env.STORAGE_DIR = dir;
    logoKey = buildObjectKey("logos", randomUUID(), "png");
    await putObject(logoKey, PNG_BYTES);
    // A file the allowlist must never serve, however it is addressed.
    await writeFile(join(dir, "secret.txt"), "not for visitors");
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    if (previousStorageDir === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = previousStorageDir;
  });

  it("serves a stored object with its content type, caching, and hardening headers", async () => {
    const response = await get(logoKey.split("/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(String(PNG_BYTES.length));
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("refuses traversal, non-image paths, malformed keys, and empty keys alike", async () => {
    const refused = [
      ["..", "..", ".env.local"],
      ["tenants", "..", "..", "..", "package.json"],
      ["secret.txt"],
      [".env.local"],
      ["api", "images"],
      [],
      // Allowlisted extension only: a stored SVG (or anything else) is not a key.
      ["tenants", randomUUID(), "logos", `${randomUUID()}.svg`],
      // Shape enforced: tenant segment must be a uuid, not any string.
      ["tenants", "not-a-uuid", "logos", `${randomUUID()}.png`],
      // …and the random tail must be a uuid too.
      ["tenants", randomUUID(), "logos", "logo.png"],
    ];
    for (const key of refused) {
      const response = await get(key);
      expect({ key: key.join("/"), status: response.status }).toEqual({
        key: key.join("/"),
        status: 404,
      });
    }
  });

  it("returns 404 for a well-formed key nobody uploaded — the guessing attack", async () => {
    for (const kind of ["logos", "items"] as const) {
      const guessed = buildObjectKey(kind, randomUUID(), "png");
      const response = await get(guessed.split("/"));
      expect({ guessed, status: response.status }).toEqual({ guessed, status: 404 });
    }
  });
});
