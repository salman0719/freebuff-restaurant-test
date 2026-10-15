/**
 * Shared E2E utilities (Phase 3.9): deterministic seed for the owner
 * journey plus Mailpit helpers for the real magic-link round-trip.
 *
 * The seed is idempotent under the `e2e-` namespace: global setup wipes
 * any prior run's rows, so a crashed run never poisons the next one.
 * `.env.local` is loaded here because Playwright workers don't inherit
 * Next's env loading (the app server under test loads it itself).
 */
import { loadEnvConfig } from "@next/env";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { RateLimitScope } from "../src/lib/signin-rate-limit";
import { auditEvents, memberships, sessions, signinRateLimits, tenants, users } from "../db/schema";

loadEnvConfig(process.cwd());

export const E2E_EMAIL = "owner-e2e@example.com";
export const E2E_SLUG = "e2e-bistro";
export const E2E_NAME = "E2E Bistro";
/** Platform-staff fixture (Phase 4.1) — a global `operator` role. */
export const E2E_OPERATOR_EMAIL = "staff-e2e@example.com";

/** The session cookie NextAuth writes for an http origin (no `__Secure-`). */
export const SESSION_COOKIE = "authjs.session-token";

export function mailpitBase(): string {
  return process.env.MAILPIT_URL ?? "http://localhost:8025";
}

/** One short-lived client per call, always closed — leaked pools outlive the run. */
function newDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Start Postgres (`docker compose up -d`) first.");
  }
  const client = postgres(url, { max: 1 });
  return { db: drizzle(client), close: () => client.end() };
}

/** Reset the journey tenant to a fresh draft owned by the journey user. */
export async function seedOwnerJourney(): Promise<void> {
  // Sign-in rate limiting (Phase 6.1, F3) is app state, not fixture state, so
  // the suite starts it clean — see `resetAllSigninRateLimits`.
  await resetAllSigninRateLimits();
  const { db, close } = newDb();
  try {
    await db.delete(tenants).where(eq(tenants.slug, E2E_SLUG));
    await db.delete(users).where(eq(users.email, E2E_EMAIL));
    const [user] = await db.insert(users).values({ email: E2E_EMAIL }).returning({ id: users.id });
    const [tenant] = await db
      .insert(tenants)
      .values({ slug: E2E_SLUG })
      .returning({ id: tenants.id });
    await db.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: "owner" });
  } finally {
    await close();
  }
}

/**
 * The journey owner's user id. Read-only: global setup owns that fixture, and
 * a spec that re-seeded it would race the journey when Playwright runs files
 * in parallel.
 */
export async function findUserIdByEmail(email: string): Promise<string> {
  const { db, close } = newDb();
  try {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!rows[0]) throw new Error(`No seeded user for ${email} — did global setup run?`);
    return rows[0].id;
  } finally {
    await close();
  }
}

/**
 * Platform-staff fixture: the global `operator` role. Assigning that role is
 * Phase 4.2's provisioning UI; the test writes the same row production will,
 * rather than inventing a second way to become staff.
 *
 * Uses the shared staff address. A spec that needs its own must call
 * `seedOperatorUser` instead — this function deletes and re-inserts the row,
 * so two files sharing an address would delete each other's staff mid-run.
 */
export async function seedOperator(): Promise<string> {
  return seedOperatorUser(E2E_OPERATOR_EMAIL);
}

/**
 * Platform-staff fixture at a caller-chosen address, for a spec that must not
 * share the staff row with another file running in parallel.
 */
export async function seedOperatorUser(email: string): Promise<string> {
  const { db, close } = newDb();
  try {
    await db.delete(users).where(eq(users.email, email));
    const [user] = await db
      .insert(users)
      .values({ email, role: "operator" })
      .returning({ id: users.id });
    return user.id;
  } finally {
    await close();
  }
}

/**
 * A disposable tenant + owner (Phase 5.2): for a spec that must own its
 * whole fixture instead of sharing the owner-journey one, which would
 * race a parallel worker re-seeding it. Cleanup is the caller's job via
 * `deleteTenantBySlug` + `deleteUserByEmail`.
 */
export async function seedTenantWithOwner(slug: string, email: string): Promise<void> {
  const { db, close } = newDb();
  try {
    await db.delete(tenants).where(eq(tenants.slug, slug));
    await db.delete(users).where(eq(users.email, email));
    const [user] = await db.insert(users).values({ email }).returning({ id: users.id });
    const [tenant] = await db.insert(tenants).values({ slug }).returning({ id: tenants.id });
    await db.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: "owner" });
  } finally {
    await close();
  }
}

/**
 * Remove a tenant a spec created through the UI, along with everything it
 * owns (every child table cascades from `tenants`). Specs clean up after
 * themselves because global setup only resets the owner-journey fixture.
 *
 * Audit rows are removed here EXPLICITLY, by their slug snapshot (Phase 4.4):
 * the trail deliberately does not cascade, so deleting the tenant would leave
 * a `tenant_id IS NULL` row behind — evidence for a restaurant that no longer
 * exists, and debris in every run's database.
 */
export async function deleteTenantBySlug(slug: string): Promise<void> {
  const { db, close } = newDb();
  try {
    await db.delete(auditEvents).where(eq(auditEvents.tenantSlug, slug));
    await db.delete(tenants).where(eq(tenants.slug, slug));
  } finally {
    await close();
  }
}

/** Remove an account a spec created through the UI. */
export async function deleteUserByEmail(email: string): Promise<void> {
  const { db, close } = newDb();
  try {
    await db.delete(users).where(eq(users.email, email));
  } finally {
    await close();
  }
}

/**
 * Clear EVERY sign-in rate-limit counter (Phase 6.1, F3), from global setup.
 *
 * Wholesale on purpose, because two things spend the budget on a developer
 * machine and neither belongs to one spec: the journey address, and the SOURCE
 * dimension — a header-less local stack derives one bucket from loopback, so
 * every spec in every run shares it (20 per window; the suite alone spends 9).
 * Left alone, the fourth `npm run test:e2e` inside one window would refuse the
 * journey's sign-in and look like a broken email path. Global setup runs once
 * before any worker, so wiping here cannot race a running spec.
 *
 * A spec's OWN addresses are a different matter: see `resetSigninRateLimit`.
 */
export async function resetAllSigninRateLimits(): Promise<void> {
  const { db, close } = newDb();
  try {
    await db.delete(signinRateLimits);
  } finally {
    await close();
  }
}

/**
 * Clear one value's sign-in rate-limit counter (Phase 6.1, F3), so a spec can
 * start from a fresh budget — for its own disposable addresses, and so a
 * Playwright retry of the same run starts clean too.
 *
 * Scope-aware because the two dimensions are keyed differently (`ip` values
 * are not lowercased/normalised the way addresses are).
 *
 * The reset must derive the same HMAC key the app derives, so it uses the
 * limiter's own functions rather than repeating the derivation. They are
 * imported dynamically INSIDE the function because `db/index.ts` fixes its
 * client at module load: a top-level import would build the placeholder pool
 * before `loadEnvConfig` above has run. `newDb()` runs first for the same
 * reason — it fails with a clear "start Postgres" message.
 */
export async function resetSigninRateLimit(
  value: string,
  scopes: RateLimitScope[] = ["email"]
): Promise<void> {
  const { db, close } = newDb();
  try {
    const { hashRateLimitKey, normalizeRateLimitKey } =
      await import("../src/lib/signin-rate-limit");
    const secret = process.env.SIGNIN_RATE_LIMIT_SECRET ?? process.env.AUTH_SECRET ?? "";
    for (const scope of scopes) {
      await db
        .delete(signinRateLimits)
        .where(
          and(
            eq(signinRateLimits.scope, scope),
            eq(
              signinRateLimits.keyHash,
              hashRateLimitKey(secret, normalizeRateLimitKey(scope, value))
            )
          )
        );
    }
  } finally {
    await close();
  }
}

/**
 * A real database session for `userId`, so a spec can be signed in without
 * the email round trip. Returns the token to set the session cookie.
 */
export async function createSession(userId: string): Promise<string> {
  const { db, close } = newDb();
  try {
    const token = `e2e-${crypto.randomUUID()}`;
    await db
      .insert(sessions)
      .values({ sessionToken: token, userId, expires: new Date(Date.now() + 60 * 60 * 1000) });
    return token;
  } finally {
    await close();
  }
}

/** The stored GLOBAL role for a user — the authority nothing may escalate. */
export async function getGlobalRole(userId: string): Promise<string> {
  const { db, close } = newDb();
  try {
    const rows = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    return rows[0]?.role ?? "(missing)";
  } finally {
    await close();
  }
}

/**
 * Delete the inbox's messages addressed to `email`, and nothing else.
 *
 * Deliberately NOT `DELETE /api/v1/messages`, which empties the whole inbox:
 * Playwright runs spec files in parallel, so a spec that carpet-bombed Mailpit
 * would delete a sibling spec's sign-in mail mid-flight. Deleting by recipient
 * (the search API's `to:` operator) keeps each spec to its own addresses, so
 * the sign-in journey and the rate-limit spec can run side by side.
 */
export async function purgeMailpitFor(email: string): Promise<void> {
  const query = encodeURIComponent(`to:${email}`);
  const response = await fetch(`${mailpitBase()}/api/v1/search?query=${query}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Mailpit purge failed (${response.status}). Is Mailpit running?`);
  }
}

interface MailpitMessage {
  ID: string;
  To?: { Address: string }[];
}

/**
 * How many inbox messages are addressed to `email`. Mailpit counts only what
 * it holds, so a spec that cares about exact numbers purges first — which is
 * what makes "the refused attempt sent nothing" observable.
 */
export async function countMessagesTo(email: string): Promise<number> {
  const list = await fetch(`${mailpitBase()}/api/v1/messages?limit=100`);
  if (!list.ok) {
    throw new Error(`Mailpit unreachable (${list.status}). Is Mailpit running?`);
  }
  const body = (await list.json()) as { messages: MailpitMessage[] };
  return body.messages.filter((message) =>
    message.To?.some((recipient) => recipient.Address === email)
  ).length;
}

/**
 * Poll Mailpit for the newest message to `email` and return the Auth.js
 * magic-link URL from its body. Throws on timeout — a missing email means
 * the sign-in send path is broken, and the test must fail, not skip.
 */
export async function fetchSignInLink(email: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;
  while (Date.now() < deadline) {
    const list = await fetch(`${mailpitBase()}/api/v1/messages?limit=50`);
    if (!list.ok) {
      throw new Error(`Mailpit unreachable (${list.status}). Is Mailpit running?`);
    }
    const body = (await list.json()) as { messages: MailpitMessage[]; total: number };
    lastCount = body.total;
    const found = body.messages.find((message) =>
      message.To?.some((recipient) => recipient.Address === email)
    );
    if (found) {
      const detail = await fetch(`${mailpitBase()}/api/v1/message/${found.ID}`);
      const full = (await detail.json()) as { Text?: string; HTML?: string };
      const match = `${full.Text ?? ""}\n${full.HTML ?? ""}`.match(
        /https?:\/\/[^\s"'<>]+api\/auth\/callback\/[^\s"'<>]+/
      );
      if (match) return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `No sign-in email for ${email} after ${timeoutMs}ms (${lastCount} messages seen).`
  );
}
