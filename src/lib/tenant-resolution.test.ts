/**
 * Live hostname-resolution tests (Phase 2.6). Same opt-in contract as the
 * isolation suite: runs only with `TEST_DATABASE_URL` set, otherwise skips
 * so CI stays green. Seeds slugs plus one custom domain and removes them
 * afterwards; nothing outside the `res_` slug namespace is touched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const live = TEST_URL ? describe : describe.skip;

const BASE = "platform.example";

live("hostname resolution (live database)", () => {
  let slugA = "";
  const customHost = "marios-restaurant.example.com";

  async function libs() {
    process.env.DATABASE_URL = TEST_URL as string;
    const resolution = await import("./tenant-resolution");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    return { ...resolution, schema, db };
  }

  beforeAll(async () => {
    const { db, schema } = await libs();
    const stamp = Date.now().toString(36);
    slugA = `res-cafe-${stamp}`;
    // Ambiguous setup on purpose: the custom domain reads exactly like a
    // platform subdomain of another tenant's slug namespace, and a second
    // tenant owns a confusingly similar slug. Exact custom-domain match
    // must win over subdomain guessing.
    await db.insert(schema.tenants).values({ slug: slugA, customDomain: customHost });
    await db.insert(schema.tenants).values({ slug: `res-other-${stamp}` });
  });

  afterAll(async () => {
    const { db, schema } = await libs();
    const { like } = await import("drizzle-orm");
    await db.delete(schema.tenants).where(like(schema.tenants.slug, "res-%"));
  });

  it("resolves a platform subdomain to its slug", async () => {
    const { resolveTenantByHost } = await libs();
    const result = await resolveTenantByHost(`${slugA}.${BASE}:4000`, BASE);
    expect(result).toEqual({ found: true, tenant: { id: expect.any(String), slug: slugA } });
  });

  it("prefers the exact custom-domain match over subdomain guessing", async () => {
    const { resolveTenantByHost } = await libs();
    const result = await resolveTenantByHost(customHost, BASE);
    expect(result).toEqual({ found: true, tenant: { id: expect.any(String), slug: slugA } });
  });

  it("returns not-found for unknown, reserved, nested, and malformed hosts", async () => {
    const { resolveTenantByHost } = await libs();
    for (const host of [
      `ghost.${BASE}`,
      `www.${BASE}`,
      `api.${BASE}`,
      `a.b.${BASE}`,
      BASE,
      "not a host!!",
      "",
    ]) {
      await expect(resolveTenantByHost(host, BASE)).resolves.toEqual({ found: false });
    }
  });

  it("resolves single-level localhost subdomains for development", async () => {
    const { resolveTenantByHost } = await libs();
    const result = await resolveTenantByHost(`${slugA}.localhost:4000`, "localhost");
    expect(result).toEqual({ found: true, tenant: { id: expect.any(String), slug: slugA } });
  });
});
