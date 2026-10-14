/**
 * Operator audit trail (Phase 4.4). Server-only: imports the database.
 *
 * The question this answers is the one nobody can answer from the rows
 * themselves: **who created or changed this restaurant?** Tenant content
 * records what a restaurant IS; nothing in it records who put it there, and
 * an operator acting on a restaurant they are not a member of leaves no trace
 * a member could see. So each act writes a row here, and the console reads
 * them back.
 *
 * Four decisions worth stating plainly, because each one is a place this
 * could have gone wrong:
 *
 * 1. **The record is written inside the act's own transaction.** A tenant and
 *    its "created" row commit together or not at all, so there is no window
 *    in which a restaurant exists unrecorded. `writeAuditEvent` is therefore
 *    transactional by signature — it takes the transaction, not the global
 *    client — and provisioning calls it from inside its own `db.transaction`.
 * 2. **Only what succeeded is recorded.** A refused grant, a duplicate
 *    address, or a validation error changes nothing, and the trail's job is
 *    what changed. An attempt log is a different feature with a different
 *    volume profile (typos included); it is not this.
 * 3. **The actor's address is read from the account row, never from the
 *    request.** `AuthenticatedUser` carries no email, and that is convenient
 *    here rather than inconvenient: a session-derived address cannot be
 *    forged into the history.
 * 4. **The detail payload stays factual and small.** A theme id, a publishing
 *    flag, an invited address — the facts an action changed. Never a
 *    restaurant's name, menu, hours, or contact details: knowing who did what
 *    is the whole brief, and 4.4 also says not to expose private tenant data
 *    unnecessarily. The row is a record of an act, not a copy of the tenant.
 *
 * Reading is as gated as writing: `listTenantActivity` re-checks the operator
 * role itself and returns `FORBIDDEN` rather than rows, for the same reason
 * `operator-tenants.ts` does — nothing here is scoped by a `TenantContext`,
 * so the check cannot be inherited from a caller's context.
 *
 * Bootstrapping note: rows written before this module existed do not exist.
 * A restaurant created in 4.2 has no "created" row, so the console shows an
 * empty history rather than inventing one; `tenants.created_at` remains the
 * honest answer to "when", just not to "by whom".
 *
 * Two reads sit on that table. `listTenantActivity` answers "who did this to
 * ONE restaurant", for the page about it. `listRecentActivity` answers "what
 * has staff been doing" across every restaurant, for the console — and it is
 * the only place that can show an act whose restaurant no longer exists,
 * because a deleted tenant leaves no page for its history to appear on. That
 * is why the platform read joins the tenant rather than trusting it: it falls
 * back to the slug snapshot instead of dropping the row.
 */
import { desc, eq } from "drizzle-orm";
import { db, type Db } from "../../db";
import type { AuditAction, MembershipRole, ThemeId } from "../../db/constants";
import { auditEvents, restaurantProfiles, tenants, users } from "../../db/schema";
import { getThemeDefinition } from "../themes/registry";
import type { AuthenticatedUser } from "./permissions";
import { err, ok, type ServiceResult } from "./result";

/**
 * The facts an action changed. Primitives only, so a row stays readable in
 * `psql` and no nesting can quietly turn into a copy of tenant content.
 */
export type AuditDetail = Record<string, string | number | boolean>;

/** An act, as it is about to be recorded. */
export interface AuditEvent {
  action: AuditAction;
  /** The staff identity the act is attributed to. */
  actor: AuthenticatedUser;
  /** The restaurant's address, or null for a platform-wide act. */
  tenantSlug: string | null;
  detail: AuditDetail;
}

/** A stored act, as the console reads it back. */
export interface AuditRecord {
  id: string;
  /** Plain `string`: a row written by a newer deploy must still render. */
  action: string;
  actorUserId: string;
  actorEmail: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  detail: AuditDetail;
  createdAt: Date;
}

/**
 * The transaction (or client) an audit row is written through. Typed off
 * `db.transaction`'s callback argument, so a caller can only reach this from
 * inside a transaction it already owns — passing the global client is a type
 * error rather than a silent loss of atomicity.
 */
export type AuditExecutor = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** How many history entries the console shows for one restaurant. */
export const ACTIVITY_LIMIT = 20;

/** The event for creating a restaurant. */
export function tenantCreatedEvent(
  actor: AuthenticatedUser,
  tenant: { slug: string; theme: ThemeId; published: boolean }
): AuditEvent {
  return {
    action: "tenant.created",
    actor,
    tenantSlug: tenant.slug,
    // The name is deliberately absent: it is tenant content, it can change,
    // and the profile row already holds it.
    detail: { theme: tenant.theme, published: tenant.published },
  };
}

/** The event for granting someone access to a restaurant. */
export function ownerGrantedEvent(
  actor: AuthenticatedUser,
  tenant: { slug: string },
  granted: { email: string; role: MembershipRole; created: boolean }
): AuditEvent {
  return {
    action: "tenant.owner_granted",
    actor,
    tenantSlug: tenant.slug,
    // The invited address belongs here — "who was given access" cannot be
    // reconstructed from the membership row once an account is deleted.
    detail: { email: granted.email, role: granted.role, invited: granted.created },
  };
}

/**
 * Append one event. `tenantId` is the resolved subject, or null for a
 * platform-wide act; the actor's address is snapshotted from their account
 * row here, inside the caller's transaction.
 */
export async function writeAuditEvent(
  exec: AuditExecutor,
  event: AuditEvent,
  tenantId: string | null
): Promise<void> {
  const rows = await exec
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, event.actor.userId))
    .limit(1);
  await exec.insert(auditEvents).values({
    action: event.action,
    actorUserId: event.actor.userId,
    actorEmail: rows[0]?.email ?? null,
    tenantId,
    tenantSlug: event.tenantSlug,
    detail: event.detail,
  });
}

/** A sentence an operator can read, plus the facts behind it. */
export interface AuditDescription {
  label: string;
  detail: string;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Pure mapping from a stored event to the console's line. Unknown actions are
 * reported by their key rather than dropped or thrown: a row written by a
 * newer deploy is still evidence, and losing it silently would be worse than
 * showing a raw identifier.
 */
export function describeAuditEvent(
  event: Pick<AuditRecord, "action" | "detail">
): AuditDescription {
  const detail = event.detail ?? {};
  if (event.action === "tenant.created") {
    const themeLabel = getThemeDefinition(detail.theme as ThemeId).label;
    return {
      label: "Created the restaurant",
      detail: `Started as ${detail.published ? "published" : "a draft"} with the ${themeLabel} theme`,
    };
  }
  if (event.action === "tenant.owner_granted") {
    const email = text(detail.email) ?? "an account";
    const staff = detail.role === "operator";
    const noun = staff ? "platform staff" : "owner";
    return {
      label: "Granted access",
      detail: detail.invited
        ? `Invited ${email} as ${noun}`
        : staff
          ? `Gave ${email} staff access`
          : `Gave ${email} owner access`,
    };
  }
  return { label: event.action, detail: "" };
}

const WHEN_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  // Fixed, because the platform renders this on the server and has no
  // per-operator timezone to render it in. Stated rather than implied: the
  // UI appends "UTC" so nobody reads a UTC clock as their own.
  timeZone: "UTC",
});

/** When an event happened, in the one timezone the platform can state. */
export function formatAuditTime(when: Date): string {
  return `${WHEN_FORMAT.format(when)} UTC`;
}

/** The read surface, injected so the gate is testable without a database. */
export interface AuditReader {
  /** One restaurant's history, newest first. */
  listForTenant(tenantId: string, limit: number): Promise<AuditRecord[]>;
}

const defaultReader: AuditReader = {
  async listForTenant(tenantId, limit) {
    const rows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        actorUserId: auditEvents.actorUserId,
        actorEmail: auditEvents.actorEmail,
        tenantId: auditEvents.tenantId,
        tenantSlug: auditEvents.tenantSlug,
        detail: auditEvents.detail,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, tenantId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
    return rows.map((row) => ({ ...row, detail: row.detail as AuditDetail }));
  },
};

/**
 * One restaurant's recorded history, newest first. `tenantId` is the id the
 * caller already resolved — an operator cannot reach this without having gone
 * through the console's gate, and this re-checks the role regardless.
 */
export async function listTenantActivity(
  act: AuthenticatedUser | null | undefined,
  tenantId: string,
  limit: number = ACTIVITY_LIMIT,
  reader: AuditReader = defaultReader
): Promise<ServiceResult<AuditRecord[]>> {
  if (act?.role !== "operator") {
    return err("FORBIDDEN", "Operator access required.");
  }
  if (!tenantId) {
    return err("NOT_FOUND", "No restaurant to read the history of.");
  }
  const events = await reader.listForTenant(tenantId, limit);
  return ok(events);
}

/** How many acts the console's platform-wide feed shows. */
export const PLATFORM_ACTIVITY_LIMIT = 10;

/** A platform-wide entry: the act, plus what its restaurant is called now. */
export interface RecentActivityEntry extends AuditRecord {
  /**
   * The restaurant's CURRENT display name, when it still exists. Null for an
   * act with no restaurant (a platform-scoped one) and for one whose
   * restaurant has since been deleted — the slug snapshot covers that case.
   */
  tenantName: string | null;
}

/**
 * Which restaurant an entry is about, for a reader who has to be told. The
 * name if the restaurant is still there, the recorded address otherwise —
 * never nothing, because a row whose subject cannot be named is exactly the
 * evidence this table exists to keep.
 */
export function activitySubject(entry: RecentActivityEntry): string | null {
  if (entry.tenantName?.trim()) {
    return entry.tenantName;
  }
  return entry.tenantSlug ?? null;
}

/** The platform-wide read surface, injected for the same reason as the other. */
export interface ActivityFeed {
  /** Every restaurant's acts, newest first. */
  listRecent(limit: number): Promise<RecentActivityEntry[]>;
}

const defaultFeed: ActivityFeed = {
  async listRecent(limit) {
    const rows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        actorUserId: auditEvents.actorUserId,
        actorEmail: auditEvents.actorEmail,
        tenantId: auditEvents.tenantId,
        tenantSlug: auditEvents.tenantSlug,
        detail: auditEvents.detail,
        createdAt: auditEvents.createdAt,
        tenantName: restaurantProfiles.name,
      })
      .from(auditEvents)
      // LEFT joins on purpose: an act outlives its restaurant, and an INNER
      // join would silently drop exactly the rows this feed is uniquely able
      // to show.
      .leftJoin(tenants, eq(tenants.id, auditEvents.tenantId))
      .leftJoin(restaurantProfiles, eq(restaurantProfiles.tenantId, tenants.id))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
    return rows.map((row) => ({ ...row, detail: row.detail as AuditDetail }));
  },
};

/**
 * What platform staff have been doing, across every restaurant, newest first.
 * The console's feed — the same staff check as the per-restaurant read, for
 * the same reason.
 *
 * Deliberately not paginated: the console shows the newest handful, and an
 * operator who needs the rest reads the restaurant's own history. If the
 * platform ever needs to scroll back, this becomes a keyset-paginated read
 * (`created_at < cursor`) rather than a bigger `limit`.
 */
export async function listRecentActivity(
  act: AuthenticatedUser | null | undefined,
  limit: number = PLATFORM_ACTIVITY_LIMIT,
  feed: ActivityFeed = defaultFeed
): Promise<ServiceResult<RecentActivityEntry[]>> {
  if (act?.role !== "operator") {
    return err("FORBIDDEN", "Operator access required.");
  }
  return ok(await feed.listRecent(limit));
}
