/**
 * Domain lifecycle suite (Phase 5.4). Live: opt-in on `TEST_DATABASE_URL`
 * like the other live suites, so a database-less run stays green.
 *
 * The domain suites each own one link of the chain — hosting
 * (`tenant-resolution.test.ts`), the claim and its DNS proof
 * (`domain-claim-live.test.ts`), and the routing fold against injected
 * fakes (`domain-routing.test.ts`). What 5.4 adds is the CHAIN: the
 * transitions between those links, in the order a support conversation
 * meets them.
 *
 * 1. a verified domain cannot be taken over — another restaurant gets a
 *    CONFLICT and keeps no claim of its own,
 * 2. removing it RELEASES it, and the next claimant still has to prove
 *    ownership before the hostname serves them,
 * 3. switching a VERIFIED claim frees the old hostname immediately (a
 *    stale verified row would be a live alias) and it is claimable again,
 * 4. a claim whose routing failed stays verified and reports pending —
 *    never "live", and a retry is honest about which fact is missing,
 * 5. removal disconnects routing, and a failed detach is reported rather
 *    than quietly blocking a removal that already happened.
 *
 * The tests are ordered and share one lifecycle on purpose: they are five
 * steps of one story, not five independent facts (the same shape
 * `domain-claim-live.test.ts` uses). Seeds live in the `dlc-` namespace
 * and are removed afterwards; DNS and the Vercel project are always
 * injected, so nothing here touches the network.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TenantContext } from "./tenant-context";

const TEST_URL = process.env.TEST_DATABASE_URL;
const live = TEST_URL ? describe : describe.skip;

const BASE = "platform.example";
const CONFIG = { token: "vercel_test_token", projectId: "prj_lifecycle_test" };

/** The Vercel seam, structurally identical to `./vercel.ts`'s `FetchLike`. */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response;
}

/** Answer the queued responses in order — the API's real call sequence. */
function apiFetch(responses: { status: number; body?: unknown }[]): FetchLike {
  return async () => {
    const next = responses.shift();
    if (!next) throw new Error("no queued response");
    return jsonResponse(next.status, next.body ?? null);
  };
}

live("domain lifecycle (live database)", () => {
  let userA = "";
  let userB = "";
  let slugA = "";
  let slugB = "";
  let domainA = "";
  let domainC = "";

  async function libs() {
    process.env.DATABASE_URL = TEST_URL as string;
    const claim = await import("./domain-claim");
    const ctx = await import("./tenant-context");
    const resolution = await import("./tenant-resolution");
    const routing = await import("./domain-routing");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    return { ...claim, ...ctx, ...resolution, ...routing, schema, db };
  }

  /** Authorised context for a seeded member — the only way claims run. */
  async function contextFor(userId: string, slug: string) {
    const { getTenantContext } = await libs();
    const result = await getTenantContext({ user: { id: userId, role: "owner" } }, slug);
    if (!result.ok) throw new Error(`seed broken: ${userId} has no access to ${slug}`);
    return result.data;
  }

  /**
   * Prove the context tenant's current claim by answering the TXT lookup
   * with its own token, asserting the record name asked for. Returns the
   * verified domain so a test reads as "…and then it served X".
   */
  async function verify(ctx: TenantContext): Promise<string> {
    const { checkDomainClaim, getDomainClaim } = await libs();
    const claim = await getDomainClaim(ctx);
    if (!claim.ok || !claim.data.domain || !claim.data.verifyToken) {
      throw new Error("test setup broken: there is no claim to verify");
    }
    const { domain, verifyToken } = claim.data;
    const checked = await checkDomainClaim(ctx, async (name) => {
      expect(name).toBe(`_restaurant-platform.${domain}`);
      return [[verifyToken]];
    });
    if (!checked.ok) throw new Error(`verification failed: ${checked.error.message}`);
    expect(checked.data).toEqual({ domain, status: "verified", recordSeen: true });
    return domain;
  }

  beforeAll(async () => {
    const { db, schema } = await libs();
    const stamp = Date.now().toString(36);
    slugA = `dlc-a-${stamp}`;
    slugB = `dlc-b-${stamp}`;
    domainA = `life-a-${stamp}.example.net`;
    domainC = `life-c-${stamp}.example.net`;
    const [ua] = await db
      .insert(schema.users)
      .values({ email: `dlc-a-${stamp}@example.com` })
      .returning({ id: schema.users.id });
    const [ub] = await db
      .insert(schema.users)
      .values({ email: `dlc-b-${stamp}@example.com` })
      .returning({ id: schema.users.id });
    userA = ua.id;
    userB = ub.id;
    const [ta] = await db
      .insert(schema.tenants)
      .values({ slug: slugA, published: true })
      .returning({ id: schema.tenants.id });
    const [tb] = await db
      .insert(schema.tenants)
      .values({ slug: slugB, published: true })
      .returning({ id: schema.tenants.id });
    await db.insert(schema.memberships).values({ userId: userA, tenantId: ta.id, role: "owner" });
    await db.insert(schema.memberships).values({ userId: userB, tenantId: tb.id, role: "owner" });
  });

  afterAll(async () => {
    const { db, schema } = await libs();
    const { like } = await import("drizzle-orm");
    await db.delete(schema.tenants).where(like(schema.tenants.slug, "dlc-%"));
    await db.delete(schema.users).where(like(schema.users.email, "dlc-%"));
  });

  it("serves the platform address from the start and refuses a takeover of a verified domain", async () => {
    const { resolveTenantByHost, submitDomainClaim, getDomainClaim } = await libs();

    // The platform address is the tenant's durable address, never at stake.
    await expect(resolveTenantByHost(`${slugA}.${BASE}`, BASE)).resolves.toEqual({
      found: true,
      tenant: { id: expect.any(String), slug: slugA },
    });

    // A claims domainA — recorded, and serving nothing until it is proven.
    const ctxA = await contextFor(userA, slugA);
    const submitted = await submitDomainClaim(ctxA, domainA);
    expect(submitted.ok).toBe(true);
    if (submitted.ok) expect(submitted.data.status).toBe("pending");
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({ found: false });

    expect(await verify(ctxA)).toBe(domainA);
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({
      found: true,
      tenant: { id: expect.any(String), slug: slugA },
    });

    // B cannot take a VERIFIED domain: release, not takeover, is what moves one.
    const ctxB = await contextFor(userB, slugB);
    const takeover = await submitDomainClaim(ctxB, domainA);
    expect(takeover.ok).toBe(false);
    if (takeover.ok) return expect.unreachable();
    expect(takeover.error.code).toBe("CONFLICT");
    expect(Object.keys(takeover.error.fields ?? {})).toEqual(["domain"]);

    // The refusal leaves B with no claim of its own — it did not half-claim.
    const bClaim = await getDomainClaim(ctxB);
    expect(bClaim.ok).toBe(true);
    if (bClaim.ok) expect(bClaim.data).toEqual({ domain: null, status: "none", verifyToken: null });

    // …and A's row is untouched: the hostname still serves A.
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({
      found: true,
      tenant: { id: expect.any(String), slug: slugA },
    });
  });

  it("releases the domain on removal, and the next restaurant must still prove it", async () => {
    const { resolveTenantByHost, submitDomainClaim, removeDomainClaim } = await libs();
    const ctxA = await contextFor(userA, slugA);

    const removed = await removeDomainClaim(ctxA);
    expect(removed.ok).toBe(true);
    if (removed.ok)
      expect(removed.data).toEqual({ domain: null, status: "none", verifyToken: null });
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({ found: false });

    // B can now claim it — this is a RELEASE, and the unique index is free.
    const ctxB = await contextFor(userB, slugB);
    const reclaimed = await submitDomainClaim(ctxB, domainA);
    expect(reclaimed.ok).toBe(true);
    if (reclaimed.ok) expect(reclaimed.data.status).toBe("pending");

    // A released domain is not a transferred one: nothing serves B yet.
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({ found: false });

    expect(await verify(ctxB)).toBe(domainA);
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({
      found: true,
      tenant: { id: expect.any(String), slug: slugB },
    });

    // A's platform address is unaffected by giving the custom domain up.
    await expect(resolveTenantByHost(`${slugA}.${BASE}`, BASE)).resolves.toEqual({
      found: true,
      tenant: { id: expect.any(String), slug: slugA },
    });
  });

  it("frees the old hostname when a verified claim switches domains", async () => {
    const { resolveTenantByHost, submitDomainClaim } = await libs();
    const ctxB = await contextFor(userB, slugB);

    // B was VERIFIED on domainA. Changing the domain must not leave the old
    // hostname serving B — a stale verified row would be a live alias.
    const switched = await submitDomainClaim(ctxB, domainC);
    expect(switched.ok).toBe(true);
    if (switched.ok)
      expect(switched.data).toEqual({
        domain: domainC,
        status: "pending",
        verifyToken: expect.any(String),
      });
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({ found: false });

    // The freed hostname is genuinely claimable again — and it follows
    // PROOF, not order of arrival: A's claim serves A only once A verifies.
    const ctxA = await contextFor(userA, slugA);
    const reClaim = await submitDomainClaim(ctxA, domainA);
    expect(reClaim.ok).toBe(true);
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({ found: false });

    expect(await verify(ctxA)).toBe(domainA);
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({
      found: true,
      tenant: { id: expect.any(String), slug: slugA },
    });

    // B's unverified new domain serves nothing in the meantime.
    await expect(resolveTenantByHost(domainC, BASE)).resolves.toEqual({ found: false });
  });

  it("keeps a verified claim verified when activation fails, and reports pending — never live", async () => {
    const { connectRouting, getRoutingStatus, resolveTenantByHost, getDomainClaim } = await libs();
    const ctxA = await contextFor(userA, slugA);

    // Routing not configured (the deployed reality without VERCEL_TOKEN):
    // connecting fails closed, and the durable claim is untouched.
    const unconfigured = await connectRouting(domainA, { config: null });
    expect(unconfigured.ok).toBe(false);
    if (!unconfigured.ok) expect(unconfigured.error.message).toContain("not configured");
    const stillVerified = await getDomainClaim(ctxA);
    expect(stillVerified.ok).toBe(true);
    if (stillVerified.ok) expect(stillVerified.data.status).toBe("verified");
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({
      found: true,
      tenant: { id: expect.any(String), slug: slugA },
    });

    // Attaching is refused (another project owns it): a stated failure,
    // not a state the dashboard could read as progress.
    const refused = await connectRouting(domainA, {
      config: CONFIG,
      fetchImpl: apiFetch([
        {
          status: 409,
          body: { error: { message: "The domain is already assigned to another Vercel project" } },
        },
      ]),
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("CONFLICT");

    // Retrying succeeds, and says exactly how far it got.
    const retried = await connectRouting(domainA, {
      config: CONFIG,
      fetchImpl: apiFetch([{ status: 200, body: { name: domainA, verified: false } }]),
    });
    expect(retried.ok).toBe(true);
    if (retried.ok) expect(retried.data).toEqual({ attached: true, vercelVerified: false });

    const probeOnline = async () => "online" as const;

    // Attached, DNS not validated yet → pending.
    const awaitingValidation = await getRoutingStatus(domainA, {
      config: CONFIG,
      fetchImpl: apiFetch([
        { status: 200, body: { domains: [{ name: domainA, verified: false }] } },
      ]),
      probe: probeOnline,
    });
    expect(awaitingValidation.ok).toBe(true);
    if (awaitingValidation.ok) expect(awaitingValidation.data.status).toBe("pending");

    // Validated, HTTPS not answering yet → still pending.
    const awaitingTls = await getRoutingStatus(domainA, {
      config: CONFIG,
      fetchImpl: apiFetch([
        { status: 200, body: { domains: [{ name: domainA, verified: true }] } },
      ]),
      probe: async () => "offline",
    });
    expect(awaitingTls.ok).toBe(true);
    if (awaitingTls.ok) expect(awaitingTls.data.status).toBe("pending");

    // Only every fact together is live.
    const live = await getRoutingStatus(domainA, {
      config: CONFIG,
      fetchImpl: apiFetch([
        { status: 200, body: { domains: [{ name: domainA, verified: true }] } },
      ]),
      probe: probeOnline,
    });
    expect(live.ok).toBe(true);
    if (live.ok) {
      expect(live.data.status).toBe("live");
      expect(live.data.message).toContain("Live");
    }
  });

  it("stops serving the hostname on removal even when the edge detach fails", async () => {
    const { disconnectRouting, removeDomainClaim, resolveTenantByHost } = await libs();
    const ctxA = await contextFor(userA, slugA);

    const removed = await removeDomainClaim(ctxA);
    expect(removed.ok).toBe(true);

    // The resolver — the boundary that actually protects the tenant — stops
    // honoring the domain the moment the claim is gone…
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({ found: false });

    // …so a failed detach is REPORTED, never a reason to hold the claim open.
    const failed = await disconnectRouting(domainA, {
      config: CONFIG,
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.code).toBe("INTERNAL");

    // A retry that finds the domain already gone is success (404 semantics).
    const retried = await disconnectRouting(domainA, {
      config: CONFIG,
      fetchImpl: apiFetch([{ status: 404 }]),
    });
    expect(retried).toEqual({ ok: true, data: { detached: true } });
    await expect(resolveTenantByHost(domainA, BASE)).resolves.toEqual({ found: false });
  });
});
