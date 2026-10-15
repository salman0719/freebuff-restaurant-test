/**
 * Narrow database-error predicates, shared so the rule is written once.
 *
 * Postgres reports a unique-index violation as SQLSTATE `23505`. Several
 * modules need to turn that specific race into a friendly, typed result
 * instead of leaking a driver crash to the caller, and each of them has to
 * recognise it the same way — a copy per module drifts the moment one is
 * "fixed" to check a different field.
 *
 * **The code is not always on the error you catch.** `drizzle-orm` wraps a
 * failed statement in `DrizzleQueryError(query, params, cause)`, which keeps
 * the driver error as `cause` and copies no SQLSTATE onto itself:
 *
 * ```js
 * // node_modules/drizzle-orm/errors.cjs
 * class DrizzleQueryError extends Error {
 *   constructor(query, params, cause) { …; this.cause = cause; }
 * }
 * ```
 *
 * So a check against `error.code` alone silently never matches an error that
 * came out of the query builder — which is every error these callers see.
 * The predicate therefore walks the `cause` chain.
 *
 * (That was a real, latent bug here: `createTenantCategory` and
 * `updateTenantCategory` both claimed a lost insert race "maps to the same
 * friendly field error instead of leaking a database crash", and instead
 * threw one. The pre-existing sibling-name check makes the race rare, which
 * is why it went unnoticed.)
 */

/** How far down a `cause` chain to look before giving up. */
const MAX_CAUSE_DEPTH = 5;

/** Postgres unique-violation code — a lost race on a unique index. */
export function isUniqueViolation(error: unknown, depth: number = MAX_CAUSE_DEPTH): boolean {
  let current: unknown = error;
  for (let level = 0; level < depth; level += 1) {
    if (current === null || typeof current !== "object") {
      return false;
    }
    if ((current as { code?: unknown }).code === "23505") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
