/**
 * Public-flow integration tests (Phase 2.7). Same opt-in contract as the
 * other live suites: runs only with `TEST_DATABASE_URL`, otherwise skips.
 *
 * Walks the exact composition the root page performs — host resolution →
 * public view → theme choice — against seeded-style rows, proving the
 * wired flow serves the right tenant, hides drafts, and never leaks across
 * tenants. Route rendering itself (an async Server Component) is covered by
 * Playwright per the testing decision, not here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const live = TEST_URL ? describe : describe.skip;

const BASE = "platform.example";

live("public flow (live database)", () => {
  let slugA = "";
  let slugB = "";

  async function libs() {
    process.env.DATABASE_URL = TEST_URL as string;
    const resolution = await import("./tenant-resolution");
    const pub = await import("./public-restaurant");
    const registry = await import("../themes/registry");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    return { ...resolution, ...pub, ...registry, schema, db };
  }

  beforeAll(async () => {
    const { db, schema } = await libs();
    const stamp = Date.now().toString(36);
    slugA = `flow-a-${stamp}`;
    slugB = `flow-b-${stamp}`;
    const [ta] = await db
      .insert(schema.tenants)
      .values({ slug: slugA, theme: "cafe", published: true })
      .returning({ id: schema.tenants.id });
    const [tb] = await db
      .insert(schema.tenants)
      .values({ slug: slugB, theme: "takeaway", published: false })
      .returning({ id: schema.tenants.id });
    const [cat] = await db
      .insert(schema.menuCategories)
      .values({ tenantId: ta.id, name: "Mains" })
      .returning({ id: schema.menuCategories.id });
    await db.insert(schema.menuItems).values([
      { tenantId: ta.id, categoryId: cat.id, name: "Flow Dish", priceCents: 1000 },
      { tenantId: tb.id, categoryId: null, name: "Draft Dish", priceCents: 2000 },
    ]);
  });

  afterAll(async () => {
    const { db, schema } = await libs();
    const { like } = await import("drizzle-orm");
    await db.delete(schema.tenants).where(like(schema.tenants.slug, "flow-%"));
  });

  it("serves the published tenant with its registered theme", async () => {
    const { resolveTenantByHost, getPublicRestaurant, getTheme, resolveThemeId } = await libs();
    const resolution = await resolveTenantByHost(`${slugA}.${BASE}`, BASE);
    expect(resolution.found).toBe(true);
    if (!resolution.found) return expect.unreachable();
    const view = await getPublicRestaurant(resolution.tenant.slug);
    expect(view.ok).toBe(true);
    if (!view.ok) return expect.unreachable();
    expect(view.data.theme).toBe("cafe");
    expect(getTheme(resolveThemeId(view.data.theme)).name).toContain("Cafe");
    expect(view.data.menu.flatMap((category) => category.items).map((item) => item.name)).toEqual([
      "Flow Dish",
    ]);
  });

  it("hides the unpublished tenant at every layer", async () => {
    const { resolveTenantByHost, getPublicRestaurant } = await libs();
    // Resolution finds the tenant identity (visibility is the data
    // service's job), but the public view refuses it.
    const resolution = await resolveTenantByHost(`${slugB}.${BASE}`, BASE);
    expect(resolution.found).toBe(true);
    if (!resolution.found) return expect.unreachable();
    const view = await getPublicRestaurant(resolution.tenant.slug);
    expect(view.ok).toBe(false);
    if (!view.ok) expect(view.error.code).toBe("NOT_FOUND");
  });

  it("never mixes tenants across the flow", async () => {
    const { resolveTenantByHost, getPublicRestaurant } = await libs();
    const resolution = await resolveTenantByHost(`${slugA}.${BASE}`, BASE);
    expect(resolution.found).toBe(true);
    if (!resolution.found) return expect.unreachable();
    const view = await getPublicRestaurant(resolution.tenant.slug);
    expect(view.ok).toBe(true);
    if (!view.ok) return expect.unreachable();
    expect(JSON.stringify(view.data)).not.toContain("Draft Dish");
  });
});
