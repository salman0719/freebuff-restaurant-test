/**
 * Public menu at scale (Phase 6.3). Live: opt-in on `TEST_DATABASE_URL`,
 * the same contract as the other live suites — without it this file skips,
 * so the unit job stays database-free.
 *
 * The public page loads a whole menu in one pass, and that shape is worth
 * pinning: the round trips a visitor's request costs must not move with
 * menu size. The day somebody "just fetches the items per category first",
 * an 8-item menu still renders everywhere while a 200-item menu quietly
 * costs 200 extra round trips — so the same service call is measured
 * against an 8-item tenant and a 400-item tenant and held to the same
 * number of queries, plus a wall-clock smoke ceiling.
 *
 * Query counting: every query drizzle issues through the postgres-js
 * driver passes through `client.unsafe`
 * (drizzle-orm/postgres-js/session.js), so patching that one method counts
 * round trips exactly — no pg_stat extension, no new dependency, and it
 * works against whatever database the live suites already point at.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../db";

const TEST_URL = process.env.TEST_DATABASE_URL;
const live = TEST_URL ? describe : describe.skip;

/** Deliberately different orders of magnitude, not 8 vs 16. */
const SMALL_ITEMS = 8;
const LARGE_ITEMS = 400;
const CATEGORIES = 2;
/**
 * Smoke ceiling, not a benchmark: this loads in ~10 ms locally, so 1 s
 * only fails when the load stops being one pass. The exact guarantee is
 * the query count; this is the backstop if the counter seam ever moved.
 */
const LOAD_BUDGET_MS = 1_000;
/** tenant + profile + hours + categories + items — five, always. */
const QUERIES_PER_VIEW = 5;

type DbRun<T> = [result: T, queries: number];

/** Run `roundTrip`, returning its result plus how many queries it cost. */
async function counting<T>(db: Db, roundTrip: () => Promise<T>): Promise<DbRun<T>> {
  // See the file header: one seam, every round trip. The property is an
  // own one on the postgres.js client, so plain assignment restores it
  // exactly; `finally` because a failed assertion must not leave the
  // shared client patched for the rest of the file.
  const client = db.$client as unknown as { unsafe: (...args: unknown[]) => unknown };
  const original = client.unsafe;
  let queries = 0;
  client.unsafe = function (this: unknown, ...args: unknown[]) {
    queries += 1;
    return original.apply(this, args);
  };
  try {
    return [await roundTrip(), queries];
  } finally {
    client.unsafe = original;
  }
}

live("public menu at scale (live database)", () => {
  let slugSmall = "";
  let slugLarge = "";

  async function libs() {
    process.env.DATABASE_URL = TEST_URL as string;
    const pub = await import("./public-restaurant");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    return { ...pub, schema, db };
  }

  beforeAll(async () => {
    const { db, schema } = await libs();
    const stamp = Date.now().toString(36);
    slugSmall = `scale-small-${stamp}`;
    slugLarge = `scale-large-${stamp}`;

    const tenants = [slugSmall, slugLarge];
    const inserted = await db
      .insert(schema.tenants)
      .values(tenants.map((slug) => ({ slug, theme: "cafe", published: true })))
      .returning({ id: schema.tenants.id });
    const [smallTenant, largeTenant] = inserted;
    if (!smallTenant || !largeTenant) throw new Error("fixture tenants did not insert");

    for (const [tenantId, total] of [
      [smallTenant.id, SMALL_ITEMS],
      [largeTenant.id, LARGE_ITEMS],
    ] as const) {
      const categories = await db
        .insert(schema.menuCategories)
        .values(
          Array.from({ length: CATEGORIES }, (_, index) => ({
            tenantId,
            name: `Section ${index + 1}`,
          }))
        )
        .returning({ id: schema.menuCategories.id });
      const [first, second] = categories;
      if (!first || !second) throw new Error("fixture categories did not insert");
      await db.insert(schema.menuItems).values(
        Array.from({ length: total }, (_, index) => ({
          tenantId,
          categoryId: index % 2 === 0 ? first.id : second.id,
          name: `Dish ${index + 1}`,
          priceCents: 1_000 + index,
          sortOrder: index,
        }))
      );
    }
  });

  afterAll(async () => {
    const { db, schema } = await libs();
    const { like } = await import("drizzle-orm");
    await db.delete(schema.tenants).where(like(schema.tenants.slug, "scale-%"));
  });

  it("costs the same round trips for 400 items as for 8", async () => {
    const { db, getPublicRestaurant } = await libs();
    const [small, smallQueries] = await counting(db, () => getPublicRestaurant(slugSmall));
    const [large, largeQueries] = await counting(db, () => getPublicRestaurant(slugLarge));

    expect(small.ok).toBe(true);
    expect(large.ok).toBe(true);
    // Five, not five-ish: name the queries so adding a sixth is a
    // deliberate decision this test gets a vote on, not a silent tax.
    expect(smallQueries).toBe(QUERIES_PER_VIEW);
    expect(largeQueries).toBe(smallQueries);
  });

  it("returns the whole 400-item menu in one pass, within a smoke ceiling", async () => {
    const { db, getPublicRestaurant } = await libs();
    // Warm the connection and the prepared statements so the first query
    // of the test file is not what the ceiling measures.
    await getPublicRestaurant(slugLarge);

    const started = performance.now();
    const [view] = await counting(db, () => getPublicRestaurant(slugLarge));
    const elapsed = performance.now() - started;

    expect(view.ok).toBe(true);
    if (!view.ok) return expect.unreachable();
    expect(view.data.menu).toHaveLength(CATEGORIES);
    const items = view.data.menu.flatMap((category) => category.items);
    expect(items).toHaveLength(LARGE_ITEMS);
    expect(items.filter((item) => item.name === "Dish 1")).toHaveLength(1);
    expect(items.filter((item) => item.name === `Dish ${LARGE_ITEMS}`)).toHaveLength(1);
    expect(elapsed).toBeLessThan(LOAD_BUDGET_MS);
  });
});
