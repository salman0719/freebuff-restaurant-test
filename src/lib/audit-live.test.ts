/**
 * Live audit-trail suite (Phase 4.4).
 *
 * Exercises the REAL provisioning store against a database — the half a
 * fake cannot prove: that the record and the change commit together, that a
 * refused act writes nothing, and that the trail outlives the rows it
 * describes. Opt-in exactly like `tenant-isolation.test.ts`: runs only when
 * `TEST_DATABASE_URL` points at a database it may write to (local Docker:
 * `TEST_DATABASE_URL="postgresql://app:secret@localhost:4432/restaurant_app"`),
 * otherwise it skips so a run without a database stays green.
 *
 * The steps are deliberately sequential: each one inspects the state the
 * previous one produced (create → read → grant twice → delete the tenant).
 * Everything it writes lives under the `audit-live-` namespace and is removed
 * in `afterAll` — the audit rows by their SLUG snapshot, which is the point:
 * after the tenant is deleted, the slug is the only handle left.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "./permissions";

const TEST_URL = process.env.TEST_DATABASE_URL;
const live = TEST_URL ? describe : describe.skip;

live("operator audit trail (live database)", () => {
  const stamp = Date.now().toString(36);
  const slug = `audit-live-${stamp}`;
  const actorEmail = `audit-live-staff-${stamp}@example.com`;
  const ownerEmail = `audit-live-owner-${stamp}@example.com`;
  let staff: AuthenticatedUser = { userId: "unset", role: "operator" };
  let tenantId = "";

  // Lazy imports: `db` resolves its client on first query, so assigning the
  // test URL here (before any query) is enough — the same seam the other live
  // suites use.
  async function libs() {
    process.env.DATABASE_URL = TEST_URL as string;
    const provisioning = await import("./tenant-provisioning");
    const audit = await import("./audit");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    const drizzle = await import("drizzle-orm");
    return { ...provisioning, ...audit, schema, db, ...drizzle };
  }

  /** The raw rows for this suite's restaurant, newest first. */
  async function rows() {
    const { db, schema, desc, eq } = await libs();
    return db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.tenantSlug, slug))
      .orderBy(desc(schema.auditEvents.createdAt));
  }

  beforeAll(async () => {
    const { db, schema } = await libs();
    const [actor] = await db
      .insert(schema.users)
      .values({ email: actorEmail, role: "operator" })
      .returning({ id: schema.users.id });
    staff = { userId: actor.id, role: "operator" };
  });

  afterAll(async () => {
    const { db, schema, eq, inArray } = await libs();
    // Deleted by slug: the tenant may already be gone, which is exactly the
    // case this suite leaves behind.
    await db.delete(schema.auditEvents).where(eq(schema.auditEvents.tenantSlug, slug));
    await db.delete(schema.tenants).where(eq(schema.tenants.slug, slug));
    await db.delete(schema.users).where(inArray(schema.users.email, [actorEmail, ownerEmail]));
  });

  it("records the creation, attributed to the operator by name", async () => {
    const { db, schema, eq, provisionTenant } = await libs();
    const created = await provisionTenant(staff, {
      slug,
      name: "Audit Live Kitchen",
      theme: "takeaway",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    tenantId = created.data.id;

    const recorded = await rows();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      action: "tenant.created",
      actorUserId: staff.userId,
      // Snapshot read from the account row, not from anything a caller sent.
      actorEmail,
      tenantId,
      tenantSlug: slug,
      detail: { theme: "takeaway", published: false },
    });

    // The restaurant really exists, so the record is not describing a write
    // that failed.
    const stored = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId));
    expect(stored).toHaveLength(1);
  });

  it("reads the history back through the staff-gated read", async () => {
    const { listTenantActivity } = await libs();
    const result = await listTenantActivity(staff, tenantId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((event) => event.action)).toEqual(["tenant.created"]);
      expect(result.data[0].actorEmail).toBe(actorEmail);
    }
  });

  it("shows the act in the platform-wide feed, named after its restaurant", async () => {
    const { listRecentActivity } = await libs();
    const result = await listRecentActivity(staff);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const mine = result.data.find((event) => event.tenantSlug === slug);
      expect(mine?.tenantName).toBe("Audit Live Kitchen");
      expect(mine?.actorEmail).toBe(actorEmail);
    }
  });

  it("records the grant, and nothing for a grant that was refused", async () => {
    const { inviteTenantOwner } = await libs();
    const granted = await inviteTenantOwner(staff, { slug, email: ownerEmail });
    expect(granted.ok).toBe(true);

    const after = await rows();
    expect(after.map((event) => event.action)).toEqual(["tenant.owner_granted", "tenant.created"]);
    expect(after[0].detail).toEqual({ email: ownerEmail, role: "owner", invited: true });

    // The same person again: a conflict, and no second record — the trail
    // describes what changed, and nothing did.
    const again = await inviteTenantOwner(staff, { slug, email: ownerEmail });
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error.code).toBe("CONFLICT");
    }
    expect(await rows()).toHaveLength(2);
  });

  it("keeps the record after the restaurant is deleted", async () => {
    const { db, schema, eq } = await libs();
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));

    const survivors = await rows();
    expect(survivors).toHaveLength(2);
    // SET NULL, not CASCADE: the id is gone, the fact is not, and the slug
    // snapshot is what still says which restaurant it was.
    for (const event of survivors) {
      expect(event.tenantId).toBeNull();
      expect(event.tenantSlug).toBe(slug);
      expect(event.actorEmail).toBe(actorEmail);
    }

    // The platform feed is the only surface left that can show these at all,
    // and it shows them by address rather than dropping them.
    const { listRecentActivity, activitySubject } = await libs();
    const feed = await listRecentActivity(staff);
    expect(feed.ok).toBe(true);
    if (feed.ok) {
      const mine = feed.data.find((event) => event.tenantSlug === slug);
      expect(mine?.tenantId).toBeNull();
      expect(mine?.tenantName).toBeNull();
      expect(mine && activitySubject(mine)).toBe(slug);
    }
  });

  it("keeps the record after the operator's account is deleted", async () => {
    const { db, schema, eq } = await libs();
    await db.delete(schema.users).where(eq(schema.users.id, staff.userId));

    const survivors = await rows();
    expect(survivors).toHaveLength(2);
    // No FK on the actor: closing an account does not rewrite history, and
    // the snapshot is what keeps the line readable.
    expect(survivors[0].actorUserId).toBe(staff.userId);
    expect(survivors[0].actorEmail).toBe(actorEmail);

    // Reading still needs staff — but the platform can still answer the
    // question, which is the whole point of the trail.
    const { listTenantActivity } = await libs();
    const refused = await listTenantActivity({ userId: "user_owner", role: "owner" }, tenantId);
    expect(refused.ok).toBe(false);
  });
});
