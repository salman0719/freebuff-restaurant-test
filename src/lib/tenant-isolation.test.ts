/**
 * Live cross-tenant isolation suite (Phase 1.4).
 *
 * Exercises the REAL `getTenantContext` + scoped loaders + mutation against
 * a database — the negative paths no mock can fully prove. Opt-in: runs
 * only when `TEST_DATABASE_URL` points at a disposable database (local
 * Docker: `TEST_DATABASE_URL="postgresql://app:secret@localhost:5432/restaurant_app"`);
 * otherwise the suite skips so CI (no database) stays green. The suite
 * seeds two tenants + users and removes them afterwards; nothing outside
 * the `iso_` slug namespace is touched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const live = TEST_URL ? describe : describe.skip;

live("cross-tenant isolation (live database)", () => {
  let userA = "";
  let userB = "";
  let slugA = "";
  let slugB = "";
  let itemA = "";
  let itemB = "";

  // Lazy imports: `db` resolves its client on first query, so assigning the
  // test URL here (before any query) is enough — no import-order tricks.
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
    const stamp = Date.now().toString(36);
    slugA = `iso-a-${stamp}`;
    slugB = `iso-b-${stamp}`;
    const [ua] = await db
      .insert(schema.users)
      .values({ email: `iso-a-${stamp}@example.com` })
      .returning({ id: schema.users.id });
    const [ub] = await db
      .insert(schema.users)
      .values({ email: `iso-b-${stamp}@example.com` })
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
    await db.insert(schema.memberships).values({ userId: userA, tenantId: ta.id });
    await db.insert(schema.memberships).values({ userId: userB, tenantId: tb.id });
    const [ia] = await db
      .insert(schema.menuItems)
      .values({ tenantId: ta.id, name: "Pizza A", priceCents: 100 })
      .returning({ id: schema.menuItems.id });
    const [ib] = await db
      .insert(schema.menuItems)
      .values({ tenantId: tb.id, name: "Pizza B", priceCents: 200 })
      .returning({ id: schema.menuItems.id });
    itemA = ia.id;
    itemB = ib.id;
  });

  afterAll(async () => {
    const { db, schema } = await libs();
    const { eq, or } = await import("drizzle-orm");
    await db
      .delete(schema.tenants)
      .where(or(eq(schema.tenants.slug, slugA), eq(schema.tenants.slug, slugB)));
    await db.delete(schema.users).where(or(eq(schema.users.id, userA), eq(schema.users.id, userB)));
  });

  it("resolves a member's own tenant", async () => {
    const { getTenantContext } = await libs();
    const result = await getTenantContext({ user: { id: userA, role: "owner" } }, slugA);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.tenant.slug).toBe(slugA);
  });

  it("refuses another tenant with the same code as a missing one", async () => {
    const { getTenantContext } = await libs();
    const cross = await getTenantContext({ user: { id: userA, role: "owner" } }, slugB);
    const missing = await getTenantContext({ user: { id: userA, role: "owner" } }, "iso-nope-zzz");
    expect(cross).toEqual(missing);
    expect(cross.ok).toBe(false);
    if (!cross.ok) expect(cross.error.code).toBe("FORBIDDEN");
  });

  it("serves own items and refuses the other tenant's items", async () => {
    const { getTenantContext, getTenantItem } = await libs();
    const ctx = await getTenantContext({ user: { id: userA, role: "owner" } }, slugA);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return expect.unreachable();
    const own = await getTenantItem(ctx.data, itemA);
    expect(own.ok).toBe(true);
    const foreign = await getTenantItem(ctx.data, itemB);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("FORBIDDEN");
  });

  it("serves published tenants publicly and hides drafts, unknown, and malformed slugs identically", async () => {
    const { getPublicRestaurant } = await import("./public-restaurant");
    const { db, schema } = await libs();
    const { eq } = await import("drizzle-orm");
    await db.update(schema.tenants).set({ published: true }).where(eq(schema.tenants.slug, slugB));
    const visible = await getPublicRestaurant(slugB);
    expect(visible.ok).toBe(true);
    if (visible.ok) {
      expect(
        visible.data.menu.flatMap((category) => category.items).map((item) => item.name)
      ).toEqual(["Pizza B"]);
    }
    const draft = await getPublicRestaurant(slugA);
    const unknown = await getPublicRestaurant("iso-nope-zzz");
    const malformed = await getPublicRestaurant("Bad Slug!");
    expect(draft).toEqual(unknown);
    expect(unknown).toEqual(malformed);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("NOT_FOUND");
  });

  it("lists only the caller's own restaurants", async () => {
    const { listUserTenants } = await libs();
    const own = await listUserTenants({ user: { id: userA, role: "owner" } });
    expect(own.ok).toBe(true);
    if (!own.ok) return expect.unreachable();
    expect(own.data.map((row) => row.slug)).toEqual([slugA]);
    const stranger = await listUserTenants(null);
    expect(stranger.ok).toBe(false);
  });

  it("upserts the profile within the context tenant and rejects bad input", async () => {
    const { getTenantContext, getOwnerRestaurant, getTenantProfile, updateTenantProfile } =
      await libs();
    const ctx = await getTenantContext({ user: { id: userA, role: "owner" } }, slugA);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return expect.unreachable();
    const created = await updateTenantProfile(ctx.data, {
      name: "Trattoria A",
      phone: "0123",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return expect.unreachable();
    expect(created.data?.tenantId).toBeDefined();
    const cleared = await updateTenantProfile(ctx.data, { phone: null });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return expect.unreachable();
    expect(cleared.data?.phone).toBeNull();
    expect(cleared.data?.name).toBe("Trattoria A");
    const bad = await updateTenantProfile(ctx.data, { name: "", email: "bad" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(bad.error.fields ?? {})).toEqual(
        expect.arrayContaining(["name", "email"])
      );
    }
    const stored = await getTenantProfile(ctx.data);
    expect(stored.ok).toBe(true);
    if (!stored.ok) return expect.unreachable();
    expect(stored.data?.name).toBe("Trattoria A");
    const other = await getTenantContext({ user: { id: userB, role: "owner" } }, slugB);
    expect(other.ok).toBe(true);
    if (!other.ok) return expect.unreachable();
    const otherView = await getOwnerRestaurant(other.data);
    expect(otherView.ok).toBe(true);
    if (!otherView.ok) return expect.unreachable();
    expect(otherView.data.profile).toBeNull();
  });

  it("manages categories within the tenant and refuses cross-tenant access", async () => {
    const {
      createTenantCategory,
      updateTenantCategory,
      deleteTenantCategory,
      moveTenantCategory,
      getTenantItem,
      getTenantContext,
      db,
      schema,
    } = await libs();
    const { eq } = await import("drizzle-orm");
    const ctx = await getTenantContext({ user: { id: userA, role: "owner" } }, slugA);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return expect.unreachable();
    const tenantRows = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slugA))
      .limit(1);
    const tenantId = tenantRows[0]?.id;
    expect(tenantId).toBeDefined();
    const ids: Record<string, string> = {};
    for (const name of ["Starters", "Mains", "Desserts"]) {
      const created = await createTenantCategory(ctx.data, { name });
      expect(created.ok).toBe(true);
      if (!created.ok) return expect.unreachable();
      ids[name] = created.data.id;
    }
    const duplicate = await createTenantCategory(ctx.data, { name: "Mains" });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(duplicate.error.fields ?? {})).toEqual(["name"]);
    }
    // Deleting a category keeps its items as uncategorised (SET NULL).
    const [plated] = await db
      .insert(schema.menuItems)
      .values({
        tenantId: tenantId as string,
        categoryId: ids["Mains"],
        name: "Steak",
        priceCents: 2500,
      })
      .returning({ id: schema.menuItems.id });
    const removed = await deleteTenantCategory(ctx.data, ids["Mains"] as string);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return expect.unreachable();
    expect(removed.data.uncategorisedCount).toBe(1);
    const kept = await getTenantItem(ctx.data, (plated as { id: string }).id);
    expect(kept.ok).toBe(true);
    if (!kept.ok) return expect.unreachable();
    expect(kept.data.categoryId).toBeNull();
    // New categories go last; moving renumbers the whole list by index.
    const drinks = await createTenantCategory(ctx.data, { name: "Drinks" });
    expect(drinks.ok).toBe(true);
    if (!drinks.ok) return expect.unreachable();
    const moved = await moveTenantCategory(ctx.data, drinks.data.id, { direction: "up" });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return expect.unreachable();
    expect(moved.data.map((row) => row.name)).toEqual(["Starters", "Drinks", "Desserts"]);
    // Cross-tenant: user B's category refuses user A's update/delete/move.
    const other = await getTenantContext({ user: { id: userB, role: "owner" } }, slugB);
    expect(other.ok).toBe(true);
    if (!other.ok) return expect.unreachable();
    const foreign = await createTenantCategory(other.data, { name: "Mains" });
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) return expect.unreachable();
    const cross = await Promise.all([
      updateTenantCategory(ctx.data, foreign.data.id, { name: "Hijacked" }),
      deleteTenantCategory(ctx.data, foreign.data.id),
      moveTenantCategory(ctx.data, foreign.data.id, { direction: "up" }),
    ]);
    for (const result of cross) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    }
  });

  it("manages items within the tenant and refuses cross-tenant access", async () => {
    const {
      createTenantCategory,
      createTenantItem,
      updateTenantItem,
      deleteTenantItem,
      getTenantItem,
      getTenantContext,
    } = await libs();
    const ctx = await getTenantContext({ user: { id: userA, role: "owner" } }, slugA);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return expect.unreachable();
    const sides = await createTenantCategory(ctx.data, { name: "Sides" });
    expect(sides.ok).toBe(true);
    if (!sides.ok) return expect.unreachable();
    const created = await createTenantItem(ctx.data, {
      name: "Fries",
      priceCents: 350,
      categoryId: sides.data.id,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return expect.unreachable();
    expect(created.data.priceCents).toBe(350);
    expect(created.data.categoryId).toBe(sides.data.id);
    const repriced = await updateTenantItem(ctx.data, created.data.id, {
      priceCents: 400,
      categoryId: null,
    });
    expect(repriced.ok).toBe(true);
    if (!repriced.ok) return expect.unreachable();
    expect(repriced.data.priceCents).toBe(400);
    expect(repriced.data.categoryId).toBeNull();
    // A forged category from the other tenant is refused on both paths.
    const other = await getTenantContext({ user: { id: userB, role: "owner" } }, slugB);
    expect(other.ok).toBe(true);
    if (!other.ok) return expect.unreachable();
    const foreign = await createTenantCategory(other.data, { name: "Sides" });
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) return expect.unreachable();
    const forgedCreate = await createTenantItem(ctx.data, {
      name: "Smuggled",
      priceCents: 100,
      categoryId: foreign.data.id,
    });
    expect(forgedCreate.ok).toBe(false);
    if (!forgedCreate.ok) expect(forgedCreate.error.code).toBe("FORBIDDEN");
    const forgedUpdate = await updateTenantItem(ctx.data, created.data.id, {
      categoryId: foreign.data.id,
    });
    expect(forgedUpdate.ok).toBe(false);
    if (!forgedUpdate.ok) expect(forgedUpdate.error.code).toBe("FORBIDDEN");
    // And the other tenant cannot touch this tenant's item directly.
    const cross = await Promise.all([
      updateTenantItem(other.data, created.data.id, { name: "Hijacked" }),
      deleteTenantItem(other.data, created.data.id),
    ]);
    for (const result of cross) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    }
    const deleted = await deleteTenantItem(ctx.data, created.data.id);
    expect(deleted.ok).toBe(true);
    const gone = await getTenantItem(ctx.data, created.data.id);
    expect(gone.ok).toBe(false);
  });

  it("scopes the owner view and the mutation to the context tenant", async () => {
    const { getTenantContext, getOwnerRestaurant, updateTenantSettings } = await libs();
    const ctx = await getTenantContext({ user: { id: userB, role: "owner" } }, slugB);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return expect.unreachable();
    const view = await getOwnerRestaurant(ctx.data);
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.data.items.map((item) => item.name)).toEqual(["Pizza B"]);
    }
    const saved = await updateTenantSettings(ctx.data, { theme: "takeaway" });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.data.theme).toBe("takeaway");
  });
});
