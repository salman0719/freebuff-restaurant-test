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
