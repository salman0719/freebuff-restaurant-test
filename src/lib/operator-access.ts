/**
 * Operator surface gate (Phase 4.1).
 *
 * Every operator-only route goes through this one gate, so its two failure
 * modes can never drift apart between pages:
 *
 * - anonymous → `/login?next=`, preserving where they were headed;
 * - signed in but not platform staff → the SAME not-found page as an unknown
 *   route, so an owner is never told the console exists.
 *
 * The role it reads is `users.role` as loaded by the Auth.js adapter from the
 * database. Nothing request-supplied is trusted: no query parameter, form
 * field, or header can raise a caller's privileges, because `operatorGate`
 * accepts only the exact string `operator` (see the forged-claim cases in
 * `permissions.test.ts`). `/operator` is also behind the `proxy.ts` edge gate
 * for anonymous traffic, but that gate is never the only check — this one runs
 * server-side on every request.
 *
 * Server-only. `operatorGate` is pure, so the decision stays unit-testable
 * without a database; `requireOperatorPage` performs the navigation, and is
 * what `page.tsx`/`layout.tsx` files must call (a guard test in
 * `operator-access.test.ts` enforces that under `src/app/operator`).
 *
 * Operator *actions* have no consumer yet; when 4.2 adds one it needs the
 * structured variant (`requireOperator` → an error state to return), not the
 * navigating one — an action must fail closed with a result, not redirect.
 */
import { notFound, redirect } from "next/navigation";
import { requireOperator, type AuthSession, type AuthenticatedUser } from "./permissions";

export const OPERATOR_PATH = "/operator";
export const OPERATOR_SIGN_IN_PATH = `/login?next=${OPERATOR_PATH}`;

export type OperatorGate =
  { kind: "allow"; user: AuthenticatedUser } | { kind: "sign-in" } | { kind: "not-found" };

/**
 * Decide what an operator surface should do with this session. Pure: no
 * database, no navigation, no side effects.
 */
export function operatorGate(session: AuthSession | null): OperatorGate {
  const check = requireOperator(session);
  if (check.ok) {
    return { kind: "allow", user: check.data };
  }
  return check.error.code === "UNAUTHORIZED" ? { kind: "sign-in" } : { kind: "not-found" };
}

/**
 * Guard an operator page or layout: returns the staff identity, or leaves
 * through the navigation above. Never returns for a non-staff caller.
 */
export function requireOperatorPage(session: AuthSession | null): AuthenticatedUser {
  const gate = operatorGate(session);
  if (gate.kind === "sign-in") {
    redirect(OPERATOR_SIGN_IN_PATH);
  }
  if (gate.kind === "not-found") {
    notFound();
  }
  return gate.user;
}
