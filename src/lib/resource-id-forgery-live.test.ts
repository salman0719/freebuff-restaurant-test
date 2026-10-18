/**
 * Resource-id forgery suite (Phase 6.1). Live: opt-in on
 * `TEST_DATABASE_URL` like the sibling live suites.
 *
 * 6.1 asks for exactly one thing to be TESTED rather than reviewed: unauthorised
 * access attempted by changing resource ids. The isolation suite already
 * proves a foreign id is refused; this suite pins the three properties that
 * make the refusal worth something, and that a refusal which merely returns an
 * error could still violate:
 *
 * 1. **No enumeration oracle.** A foreign id and a never-existed id must be
 *    indistinguishable — same code, same message, same shape. If a foreign id
 *    answered differently from an absent one, an attacker could probe the
 *    table for which ids are real.
 * 2. **A refused write changes nothing.** Every cross-tenant attempt is
 *    followed by reading the victim's own state back: the row, its count, and
 *    its stored photo must be exactly as they were. "It returned FORBIDDEN"
 *    and "it did not write" are different claims.
 * 3. **A claimed role is not a membership.** A session asserting the
 *    platform-staff role, or an owner role for a restaurant it is not a member
 *    of, must not widen access — the membership row is the only proof.
 *
 * Seeds live in the `rif-` namespace and are removed afterwards; uploads go to
 * a temp `STORAGE_DIR` that is restored on exit.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const live = TEST_URL ? describe : describe.skip;

/** A valid PNG header, so file validation passes and the ID check is what runs. */
function pngFile(fill: number): File {
  // Note: forged attempts return FORBIDDEN before `sharp` runs (ID check
  // precedes resize), so a magic-valid stub is enough here. Real uploads
  // elsewhere use decodable images (see `realPng` below).
  return new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, fill])],
    "x.png",
    {
      type: "image/png",
    }
  );
}

live("resource-id forgery (live database)", () => {
  let userA = "";
  let userB = "";
  let slugA = "";
  let slugB = "";
  let categoryA = "";
  let categoryB = "";
  let itemA = "";
  let itemB = "";
  let storageRoot = "";
  let previousStorageDir: string | undefined;

  async function libs() {
    process.env.DATABASE_URL = TEST_URL as string;
    const ctx = await import("./tenant-context");
    const data = await import("./tenant-data");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    return { ...ctx, ...data, schema, db };
  }

  /** Real decodable PNG for the one honest upload (`sharp` must succeed). */
  async function realPng(): Promise<File> {
    const { default: sharp } = await import("sharp");
    const buf = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 90, g: 140, b: 190 } },
    })
      .png()
      .toBuffer();
    return new File([new Uint8Array(buf)], "x.png", { type: "image/png" });
  }

  async function contextFor(userId: string, slug: string) {
    const { getTenantContext } = await libs();
    const result = await getTenantContext({ user: { id: userId, role: "owner" } }, slug);
    if (!result.ok) throw new Error(`seed broken: ${userId} has no access to ${slug}`);
    return result.data;
  }

  beforeAll(async () => {
    const { db, schema } = await libs();
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    previousStorageDir = process.env.STORAGE_DIR;
    storageRoot = await mkdtemp(join(tmpdir(), "rif-uploads-"));
    process.env.STORAGE_DIR = storageRoot;

    const stamp = Date.now().toString(36);
    slugA = `rif-a-${stamp}`;
    slugB = `rif-b-${stamp}`;
    const [ua] = await db
      .insert(schema.users)
      .values({ email: `rif-a-${stamp}@example.com` })
      .returning({ id: schema.users.id });
    const [ub] = await db
      .insert(schema.users)
      .values({ email: `rif-b-${stamp}@example.com` })
      .returning({ id: schema.users.id });
    userA = ua.id;
    userB = ub.id;
    const [ta] = await db
      .insert(schema.tenants)
      .values({ slug: slugA })
      .returning({ id: schema.tenants.id });
    const [tb] = await db
      .insert(schema.tenants)
      .values({ slug: slugB })
      .returning({ id: schema.tenants.id });
    await db.insert(schema.memberships).values({ userId: userA, tenantId: ta.id, role: "owner" });
    await db.insert(schema.memberships).values({ userId: userB, tenantId: tb.id, role: "owner" });
    const [ca] = await db
      .insert(schema.menuCategories)
      .values({ tenantId: ta.id, name: "A Mains" })
      .returning({ id: schema.menuCategories.id });
    const [cb] = await db
      .insert(schema.menuCategories)
      .values({ tenantId: tb.id, name: "B Mains" })
      .returning({ id: schema.menuCategories.id });
    categoryA = ca.id;
    categoryB = cb.id;
    const [ia] = await db
      .insert(schema.menuItems)
      .values({ tenantId: ta.id, categoryId: ca.id, name: "A Pizza", priceCents: 111 })
      .returning({ id: schema.menuItems.id });
    const [ib] = await db
      .insert(schema.menuItems)
      .values({ tenantId: tb.id, categoryId: cb.id, name: "B Pizza", priceCents: 222 })
      .returning({ id: schema.menuItems.id });
    itemA = ia.id;
    itemB = ib.id;
  });

  afterAll(async () => {
    const { db, schema } = await libs();
    const { like } = await import("drizzle-orm");
    const { rm } = await import("node:fs/promises");
    await db.delete(schema.tenants).where(like(schema.tenants.slug, "rif-%"));
    await db.delete(schema.users).where(like(schema.users.email, "rif-%"));
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    if (previousStorageDir === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = previousStorageDir;
  });

  it("refuses a foreign id and a nonexistent id identically, for every entry point", async () => {
    const libsApi = await libs();
    const ctxA = await contextFor(userA, slugA);
    const absentItem = randomUUID();
    const absentCategory = randomUUID();

    // Reads.
    expect(await libsApi.getTenantItem(ctxA, itemB)).toEqual(
      await libsApi.getTenantItem(ctxA, absentItem)
    );
    expect(await libsApi.getTenantCategory(ctxA, categoryB)).toEqual(
      await libsApi.getTenantCategory(ctxA, absentCategory)
    );
    expect(await libsApi.getTenantItems({ ...ctxA }, categoryB)).toEqual(
      await libsApi.getTenantItems({ ...ctxA }, absentCategory)
    );

    // Category mutations.
    const categoryAttempts: [string, () => Promise<unknown>][] = [
      ["update", () => libsApi.updateTenantCategory(ctxA, categoryB, { name: "Hijacked" })],
      ["delete", () => libsApi.deleteTenantCategory(ctxA, categoryB)],
      ["move", () => libsApi.moveTenantCategory(ctxA, categoryB, { direction: "up" })],
    ];
    for (const [label, attempt] of categoryAttempts) {
      const foreign = await attempt();
      const absent = await (label === "update"
        ? libsApi.updateTenantCategory(ctxA, absentCategory, { name: "Hijacked" })
        : label === "delete"
          ? libsApi.deleteTenantCategory(ctxA, absentCategory)
          : libsApi.moveTenantCategory(ctxA, absentCategory, { direction: "up" }));
      expect({ label, ...(foreign as object) }).toEqual({ label, ...(absent as object) });
      expect(foreign).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }

    // Item mutations, including both photo paths (a valid file, so the ID
    // check is what refuses — not file validation).
    const itemAttempts: [string, () => Promise<unknown>][] = [
      ["update", () => libsApi.updateTenantItem(ctxA, itemB, { name: "Hijacked" })],
      ["delete", () => libsApi.deleteTenantItem(ctxA, itemB)],
      ["setImage", () => libsApi.setTenantItemImage(ctxA, itemB, pngFile(7))],
      ["clearImage", () => libsApi.clearTenantItemImage(ctxA, itemB)],
    ];
    for (const [label, attempt] of itemAttempts) {
      const foreign = await attempt();
      const absent = await (label === "update"
        ? libsApi.updateTenantItem(ctxA, absentItem, { name: "Hijacked" })
        : label === "delete"
          ? libsApi.deleteTenantItem(ctxA, absentItem)
          : label === "setImage"
            ? libsApi.setTenantItemImage(ctxA, absentItem, pngFile(7))
            : libsApi.clearTenantItemImage(ctxA, absentItem));
      expect({ label, ...(foreign as object) }).toEqual({ label, ...(absent as object) });
      expect(foreign).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }

    // A malformed id is the same answer again — no third code to compare with.
    for (const bad of ["not-a-uuid", "", "1"]) {
      expect(await libsApi.getTenantItem(ctxA, bad)).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
      expect(await libsApi.getTenantCategory(ctxA, bad)).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
    }
  });

  it("leaves the victim's rows, counts, and files exactly as they were", async () => {
    const libsApi = await libs();
    const ctxA = await contextFor(userA, slugA);
    const ctxB = await contextFor(userB, slugB);
    const { readdir } = await import("node:fs/promises");

    // Give B a real photo first, so "unchanged" covers a stored file too.
    const withPhoto = await libsApi.setTenantItemImage(ctxB, itemB, await realPng());
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return expect.unreachable();
    const photoKey = withPhoto.data.imageKey as string;
    const before = {
      category: (await libsApi.getTenantCategory(ctxB, categoryB)).ok
        ? ((await libsApi.getTenantCategory(ctxB, categoryB)) as { data: unknown }).data
        : null,
      item: ((await libsApi.getTenantItem(ctxB, itemB)) as { data: unknown }).data,
      categories: ((await libsApi.getTenantCategories(ctxB)) as { data: unknown[] }).data.length,
      items: ((await libsApi.getTenantItems(ctxB)) as { data: unknown[] }).data.length,
      files: (await readdir(storageRoot, { recursive: true })).length,
    };

    // Every cross-tenant attempt A can make, all of which must refuse.
    const refused = await Promise.all([
      libsApi.updateTenantCategory(ctxA, categoryB, { name: "Hijacked", isPublished: false }),
      libsApi.deleteTenantCategory(ctxA, categoryB),
      libsApi.moveTenantCategory(ctxA, categoryB, { direction: "up" }),
      libsApi.updateTenantItem(ctxA, itemB, { name: "Hijacked", priceCents: 1 }),
      libsApi.deleteTenantItem(ctxA, itemB),
      libsApi.setTenantItemImage(ctxA, itemB, pngFile(11)),
      libsApi.clearTenantItemImage(ctxA, itemB),
      libsApi.createTenantItem(ctxA, {
        name: "Smuggled",
        priceCents: 1,
        categoryId: categoryB,
      }),
    ]);
    for (const result of refused) {
      expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }

    const after = {
      category: ((await libsApi.getTenantCategory(ctxB, categoryB)) as { data: unknown }).data,
      item: ((await libsApi.getTenantItem(ctxB, itemB)) as { data: unknown }).data,
      categories: ((await libsApi.getTenantCategories(ctxB)) as { data: unknown[] }).data.length,
      items: ((await libsApi.getTenantItems(ctxB)) as { data: unknown[] }).data.length,
      files: (await readdir(storageRoot, { recursive: true })).length,
    };
    expect(after).toEqual(before);
    // Specifically: the photo is still the same key, and its file still exists.
    expect((after.item as { imageKey: string }).imageKey).toBe(photoKey);
    expect((before.item as { name: string }).name).toBe("B Pizza");
    // A refused upload must not leave an orphan file on disk.
    expect(after.files).toBe(before.files);
  });

  it("refuses a composed forgery and changes nothing on either side", async () => {
    const libsApi = await libs();
    const ctxA = await contextFor(userA, slugA);
    const beforeA = ((await libsApi.getTenantItem(ctxA, itemA)) as { data: unknown }).data;
    const beforeACount = ((await libsApi.getTenantItems(ctxA)) as { data: unknown[] }).data.length;

    // Re-pointing A's OWN item at B's category, and creating a new item
    // pre-linked to it: the id is the only forged part in each case.
    expect(await libsApi.updateTenantItem(ctxA, itemA, { categoryId: categoryB })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(
      await libsApi.createTenantItem(ctxA, {
        name: "Composed",
        priceCents: 5,
        categoryId: categoryB,
      })
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const afterA = ((await libsApi.getTenantItem(ctxA, itemA)) as { data: unknown }).data;
    expect(afterA).toEqual(beforeA);
    expect((afterA as { categoryId: string }).categoryId).toBe(categoryA);
    expect(((await libsApi.getTenantItems(ctxA)) as { data: unknown[] }).data.length).toBe(
      beforeACount
    );
  });

  it("treats a claimed role as no substitute for a membership row", async () => {
    const { getTenantContext } = await libs();
    // A's session asserts the platform-staff role for B's restaurant. The
    // membership join is the authority; the claim changes nothing.
    const asStaff = await getTenantContext({ user: { id: userA, role: "operator" } }, slugB);
    const asOwner = await getTenantContext({ user: { id: userA, role: "owner" } }, slugB);
    const absent = await getTenantContext({ user: { id: userA, role: "owner" } }, "rif-nope-zzz");
    expect(asStaff).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(asStaff).toEqual(asOwner);
    expect(asStaff).toEqual(absent);

    // And no context means no scoped read either: the ids alone open nothing.
    const ctxB = await contextFor(userB, slugB);
    const libsApi = await libs();
    expect(JSON.stringify(await libsApi.getTenantCategories(ctxB))).not.toContain("A Mains");
    expect(JSON.stringify(await libsApi.getTenantItems(ctxB))).not.toContain("A Pizza");
  });
});
