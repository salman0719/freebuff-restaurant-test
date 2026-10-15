/**
 * Live domain-claim suite (Phase 5.2). Same opt-in contract as the other
 * live suites: runs only with `TEST_DATABASE_URL`, otherwise skips so a
 * database-less run stays green. Seeds two tenants + users in the `dcl-`
 * namespace and removes them afterwards.
 *
 * The claims that matter here: a claim is refused when another tenant
 * holds the domain; pending claims do NOT resolve as hostnames; the TXT
 * match is the only flip to verified; verification short-circuits without
 * further DNS; removal clears everything the resolver looks at; and the
 * context scope means one tenant's claim work never touches another's.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const live = TEST_URL ? describe : describe.skip;

const BASE = "platform.example";

live("domain claims (live database)", () => {
  let userA = "";
  let userB = "";
  let slugA = "";
  let slugB = "";
  let domainA = "";
  let domainB = "";

  async function libs() {
    process.env.DATABASE_URL = TEST_URL as string;
    const claim = await import("./domain-claim");
    const ctx = await import("./tenant-context");
    const resolution = await import("./tenant-resolution");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    return { ...claim, ...ctx, ...resolution, schema, db };
  }

  /** Authorised context for a seeded member — the only way claims run. */
  async function contextFor(userId: string, slug: string) {
    const { getTenantContext } = await libs();
    const result = await getTenantContext({ user: { id: userId, role: "owner" } }, slug);
    if (!result.ok) throw new Error(`seed broken: ${userId} has no access to ${slug}`);
    return result.data;
  }

  beforeAll(async () => {
    const { db, schema } = await libs();
    const stamp = Date.now().toString(36);
    slugA = `dcl-a-${stamp}`;
    slugB = `dcl-b-${stamp}`;
    domainA = `claim-a-${stamp}.example.net`;
    domainB = `claim-b-${stamp}.example.net`;
    const [ua] = await db
      .insert(schema.users)
      .values({ email: `dcl-a-${stamp}@example.com` })
      .returning({ id: schema.users.id });
    const [ub] = await db
      .insert(schema.users)
      .values({ email: `dcl-b-${stamp}@example.com` })
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
  });

  afterAll(async () => {
    const { db, schema } = await libs();
    const { like } = await import("drizzle-orm");
    await db.delete(schema.tenants).where(like(schema.tenants.slug, "dcl-%"));
    await db.delete(schema.users).where(like(schema.users.email, "dcl-%"));
  });

  it("records a claim as pending with a fresh token and the exact record name", async () => {
    const { submitDomainClaim, getDomainClaim, verificationRecordName } = await libs();
    const claim = await submitDomainClaim(await contextFor(userA, slugA), domainA);
    expect(claim.ok).toBe(true);
    if (!claim.ok) return expect.unreachable();
    expect(claim.data).toMatchObject({ domain: domainA, status: "pending" });
    expect(claim.data.verifyToken).toBeTruthy();
    expect(verificationRecordName(domainA)).toBe(`_restaurant-platform.${domainA}`);

    const read = await getDomainClaim(await contextFor(userA, slugA));
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.data).toEqual(claim.data);
  });

  it("keeps the token when the same domain is re-submitted", async () => {
    const { submitDomainClaim, getDomainClaim } = await libs();
    const before = await getDomainClaim(await contextFor(userA, slugA));
    if (!before.ok) return expect.unreachable();
    const again = await submitDomainClaim(await contextFor(userA, slugA), domainA);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.data.verifyToken).toBe(before.data.verifyToken);
  });

  it("refuses a domain another tenant already claimed, keyed to the field", async () => {
    const { submitDomainClaim } = await libs();
    const conflict = await submitDomainClaim(await contextFor(userB, slugB), domainA);
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return expect.unreachable();
    expect(conflict.error.code).toBe("CONFLICT");
    expect(Object.keys(conflict.error.fields ?? {})).toEqual(["domain"]);
  });

  it("does not resolve a pending claim as a hostname", async () => {
    const { resolveTenantByHost } = await libs();
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({ found: false });
  });

  it("keeps the claim pending for an absent or wrong TXT record", async () => {
    const { checkDomainClaim, getDomainClaim } = await libs();
    const ctxA = await contextFor(userA, slugA);
    const claim = await getDomainClaim(ctxA);
    if (!claim.ok) return expect.unreachable();

    const absent = await checkDomainClaim(ctxA, async () => []);
    expect(absent.ok).toBe(true);
    if (absent.ok)
      expect(absent.data).toEqual({ domain: domainA, status: "pending", recordSeen: false });

    const wrong = await checkDomainClaim(ctxA, async () => [["definitely-not-the-token"]]);
    expect(wrong.ok).toBe(true);
    if (wrong.ok)
      expect(wrong.data).toEqual({ domain: domainA, status: "pending", recordSeen: false });
  });

  it("reports a failed DNS query as an error, not as a wrong record", async () => {
    const { checkDomainClaim } = await libs();
    const result = await checkDomainClaim(await contextFor(userA, slugA), async () => {
      throw Object.assign(new Error("query failed"), { code: "ESERVFAIL" });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INTERNAL");
  });

  it("verifies on an exact token match, and only then does the hostname resolve", async () => {
    const { checkDomainClaim, getDomainClaim, resolveTenantByHost } = await libs();
    const ctxA = await contextFor(userA, slugA);
    const claim = await getDomainClaim(ctxA);
    if (!claim.ok) return expect.unreachable();

    const checked = await checkDomainClaim(ctxA, async (name) => {
      expect(name).toBe(`_restaurant-platform.${domainA}`);
      return [[claim.data.verifyToken as string]];
    });
    expect(checked.ok).toBe(true);
    if (checked.ok)
      expect(checked.data).toEqual({ domain: domainA, status: "verified", recordSeen: true });

    const resolved = await resolveTenantByHost(domainA, BASE);
    expect(resolved).toEqual({ found: true, tenant: { id: expect.any(String), slug: slugA } });
  });

  it("short-circuits a verified claim without touching DNS again", async () => {
    const { checkDomainClaim } = await libs();
    const result = await checkDomainClaim(await contextFor(userA, slugA), async () => {
      throw new Error("lookup must not run for a verified claim");
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("verified");
  });

  it("scopes claim work to the context tenant", async () => {
    const { submitDomainClaim, getDomainClaim } = await libs();
    const ctxB = await contextFor(userB, slugB);
    const own = await submitDomainClaim(ctxB, domainB);
    expect(own.ok).toBe(true);

    // The other tenant's verified claim is untouched by B's activity…
    const readA = await getDomainClaim(await contextFor(userA, slugA));
    expect(readA.ok).toBe(true);
    if (readA.ok)
      expect(readA.data).toEqual({
        domain: domainA,
        status: "verified",
        verifyToken: readA.data.verifyToken,
      });

    // …and a stranger cannot even establish a context to try with.
    const { getTenantContext } = await libs();
    const stranger = await getTenantContext({ user: { id: userA, role: "owner" } }, slugB);
    expect(stranger.ok).toBe(false);
    if (!stranger.ok) expect(stranger.error.code).toBe("FORBIDDEN");
  });

  it("removes the claim completely, and removal is idempotent", async () => {
    const { removeDomainClaim, getDomainClaim, resolveTenantByHost } = await libs();
    const ctxA = await contextFor(userA, slugA);

    const removed = await removeDomainClaim(ctxA);
    expect(removed.ok).toBe(true);
    if (removed.ok)
      expect(removed.data).toEqual({ domain: null, status: "none", verifyToken: null });

    const read = await getDomainClaim(ctxA);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.data.domain).toBeNull();

    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({ found: false });

    const again = await removeDomainClaim(ctxA);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.data.domain).toBeNull();
  });
});
