/**
 * Server-side permission helpers (Phase 1.3).
 *
 * Pure functions over a session shape — no database import here, so unit
 * tests run without `DATABASE_URL` and callers inject the membership row
 * they loaded for the resolved tenant. Phase 1.4 wires these to
 * tenant-scoped queries; every helper is re-checked near the data, never
 * only in `proxy.ts` or the UI.
 *
 * Rules (see 0003):
 * - No session → `UNAUTHORIZED`.
 * - Wrong role / no membership row → `FORBIDDEN` (never reveal whether the
 *   tenant exists: same code for "no such tenant" and "not a member").
 * - A global `owner` role NEVER implies tenant access; only a matching
 *   `memberships` row does. The `userId` on the row must equal the session
 *   user id — client-sent user ids are never trusted.
 */
import type { MembershipRole } from "../../db/constants";
import { err, ok, type ServiceResult } from "./result";

export interface SessionUser {
  id: string;
  role?: string;
  email?: string | null;
}

export interface AuthSession {
  user?: SessionUser | null;
}

export interface MembershipRow {
  userId: string;
  tenantId: string;
  role: MembershipRole;
}

export interface AuthenticatedUser {
  userId: string;
  role: string;
}

/** Session must exist; returns the caller's identity. */
export function requireUser(session: AuthSession | null): ServiceResult<AuthenticatedUser> {
  const user = session?.user;
  if (!user?.id) {
    return err("UNAUTHORIZED", "Sign in to continue.");
  }
  return ok({ userId: user.id, role: user.role ?? "owner" });
}

/** Caller must hold the global `operator` role (platform staff only). */
export function requireOperator(session: AuthSession | null): ServiceResult<AuthenticatedUser> {
  const userResult = requireUser(session);
  if (!userResult.ok) return userResult;
  if (userResult.data.role !== "operator") {
    return err("FORBIDDEN", "Operator access required.");
  }
  return userResult;
}

/**
 * Caller must hold a `memberships` row for `tenantId`. Pass the row loaded
 * for the resolved tenant (or null when none exists); the helper verifies
 * it belongs to the session user and carries an allowed role.
 */
export function requireTenantRole(
  session: AuthSession | null,
  membership: MembershipRow | null,
  allowed: readonly MembershipRole[] = ["owner", "operator"]
): ServiceResult<MembershipRow> {
  const userResult = requireUser(session);
  if (!userResult.ok) return userResult;
  if (
    !membership ||
    membership.userId !== userResult.data.userId ||
    !allowed.includes(membership.role)
  ) {
    return err("FORBIDDEN", "You do not have access to this restaurant.");
  }
  return ok(membership);
}

/** Convenience for owner-or-operator tenant access (the common case). */
export function requireTenantMember(
  session: AuthSession | null,
  membership: MembershipRow | null
): ServiceResult<MembershipRow> {
  return requireTenantRole(session, membership, ["owner", "operator"]);
}
