/**
 * Authorised tenant context (Phase 1.4). Server-only: imports the database.
 *
 * Single entry point for "who may act on which restaurant": callers resolve
 * a slug to a `TenantContext` once, then pass the context — never a tenant
 * id — to every scoped loader and mutation in `./tenant-data.ts`. No
 * function outside this module accepts a caller-supplied tenant id.
 *
 * Anti-enumeration: every failure to establish context (unknown slug,
 * malformed slug, missing membership, row for another user) returns the
 * same `FORBIDDEN`. Only anonymous callers get `UNAUTHORIZED`. The tenant
 * and membership are loaded in ONE join, so there is no observable
 * difference between "no such tenant" and "not a member".
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { memberships, tenants } from "../../db/schema";
import { requireUser, type AuthSession } from "./permissions";
import { err, ok, type ServiceResult } from "./result";
import type { Membership, Tenant } from "./restaurant";
import { slugSchema } from "./validation";

export interface TenantContext {
  tenant: Tenant;
  membership: Membership;
}

export interface TenantMembershipRow {
  tenant: typeof tenants.$inferSelect;
  membership: typeof memberships.$inferSelect;
}

export type TenantMembershipFinder = (
  userId: string,
  slug: string
) => Promise<TenantMembershipRow | null>;

async function findTenantWithMembership(
  userId: string,
  slug: string
): Promise<TenantMembershipRow | null> {
  const rows = await db
    .select({ tenant: tenants, membership: memberships })
    .from(tenants)
    .innerJoin(
      memberships,
      and(eq(memberships.tenantId, tenants.id), eq(memberships.userId, userId))
    )
    .where(eq(tenants.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

function forbidden(): ServiceResult<TenantContext> {
  return err("FORBIDDEN", "You do not have access to this restaurant.");
}

/** Assemble context from a joined row; null-safe, user-matched, no oracle. */
export function toTenantContext(
  row: TenantMembershipRow | null,
  userId: string
): ServiceResult<TenantContext> {
  if (!row || row.membership.userId !== userId) {
    return forbidden();
  }
  return ok({
    tenant: { ...row.tenant, theme: row.tenant.theme as Tenant["theme"] },
    membership: { ...row.membership, role: row.membership.role as Membership["role"] },
  });
}

/**
 * Resolve the authorised context for `slug`. The `find` seam defaults to
 * the live join; tests inject fakes. A malformed slug never reaches the
 * database — it cannot exist, so it is `FORBIDDEN` like everything else.
 */
export async function getTenantContext(
  session: AuthSession | null,
  slug: string,
  find: TenantMembershipFinder = findTenantWithMembership
): Promise<ServiceResult<TenantContext>> {
  const user = requireUser(session);
  if (!user.ok) return user;
  if (!slugSchema.safeParse(slug).success) {
    return forbidden();
  }
  return toTenantContext(await find(user.data.userId, slug), user.data.userId);
}
