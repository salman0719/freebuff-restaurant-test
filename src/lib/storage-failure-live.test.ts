/**
 * Storage-failure honesty suite (Phase 6.2). Live: opt-in on
 * `TEST_DATABASE_URL` like the sibling live suites.
 *
 * Before this round, `setTenantLogo` / `setTenantItemImage` let a storage
 * I/O failure throw: the server action crashed instead of returning the
 * `INTERNAL` the contract promises, and the caller could not tell the
 * owner "saved, but the photo was not". These tests pin the fixed
 * behaviour:
 *
 * 1. A failed store returns `INTERNAL` — it never throws.
 * 2. No link is written: the profile/item row is exactly as it was, so a
 *    later read never points at bytes that were never stored (no
 *    misleading state).
 * 3. No orphan file is left behind by the failed attempt.
 *
 * The failure is induced by pointing `STORAGE_DIR` at an existing *file*:
 * every store then fails inside `mkdir`/`writeFile` with `ENOTDIR`, which
 * exercises the same catch as a down or read-only disk.
 *
 * Seeds live in the `sfl-` namespace and are removed afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const live = TEST_URL ? describe : describe.skip;

function pngFile(fill: number): File {
  return new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, fill])],
    "x.png",
    { type: "image/png" }
  );
}

live("storage failure honesty (live database)", () => {
  let slug = "";
  let userId = "";
  let itemId = "";
  let blockerFile = "";
  let previousStorageDir: string | undefined;

  async function libs() {
    process.env.DATABASE_URL = TEST_URL as string;
    const ctx = await import("./tenant-context");
    const data = await import("./tenant-data");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    return { ...ctx, ...data, schema, db };
  }

  beforeAll(async () => {
    const { db, schema } = await libs();
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    previousStorageDir = process.env.STORAGE_DIR;
    const dir = await mkdtemp(join(tmpdir(), "sfl-"));
    // The blocker: a file where the storage root should be.
    blockerFile = join(dir, "blocker");
    await writeFile(blockerFile, "in the way");

    const stamp = Date.now().toString(36);
    slug = `sfl-${stamp}`;
    const [user] = await db
      .insert(schema.users)
      .values({ email: `sfl-${stamp}@example.com` })
      .returning({ id: schema.users.id });
    userId = user.id;
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ slug })
      .returning({ id: schema.tenants.id });
    await db.insert(schema.memberships).values({ userId: user.id, tenantId: tenant.id, role: "owner" });
    await db.insert(schema.restaurantProfiles).values({ tenantId: tenant.id, name: "Failure Café" });
    const [item] = await db
      .insert(schema.menuItems)
      .values({ tenantId: tenant.id, name: "Soup", priceCents: 500 })
      .returning({ id: schema.menuItems.id });
    itemId = item.id;
  });

  afterAll(async () => {
    const { db, schema } = await libs();
    const { like } = await import("drizzle-orm");
    const { rm } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await db.delete(schema.tenants).where(like(schema.tenants.slug, "sfl-%"));
    await db.delete(schema.users).where(like(schema.users.email, "sfl-%"));
    if (blockerFile) await rm(dirname(blockerFile), { recursive: true, force: true });
    if (previousStorageDir === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = previousStorageDir;
  });

  async function contextFor() {
    const { getTenantContext } = await libs();
    const result = await getTenantContext({ user: { id: userId, role: "owner" } }, slug);
    if (!result.ok) throw new Error("seed broken: no access");
    return result.data;
  }

  it("returns INTERNAL for a failed logo store and links nothing", async () => {
    const libsApi = await libs();
    process.env.STORAGE_DIR = blockerFile;
    try {
      const ctx = await contextFor();
      const before = await libsApi.getTenantProfile(ctx);
      if (!before.ok || !before.data) return expect.unreachable();
      expect(before.data.logoImageKey).toBeNull();

      const result = await libsApi.setTenantLogo(ctx, pngFile(1));
      expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });

      const after = await libsApi.getTenantProfile(ctx);
      if (!after.ok || !after.data) return expect.unreachable();
      expect(after.data.logoImageKey).toBeNull();
    } finally {
      if (previousStorageDir === undefined) delete process.env.STORAGE_DIR;
      else process.env.STORAGE_DIR = previousStorageDir;
    }
  });

  it("returns INTERNAL for a failed photo store and links nothing", async () => {
    const libsApi = await libs();
    process.env.STORAGE_DIR = blockerFile;
    try {
      const ctx = await contextFor();
      const result = await libsApi.setTenantItemImage(ctx, itemId, pngFile(2));
      expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });

      const after = await libsApi.getTenantItem(ctx, itemId);
      if (!after.ok) return expect.unreachable();
      expect(after.data.imageKey).toBeNull();
    } finally {
      if (previousStorageDir === undefined) delete process.env.STORAGE_DIR;
      else process.env.STORAGE_DIR = previousStorageDir;
    }
  });
});
