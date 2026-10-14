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
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { auditEvents, memberships, sessions, tenants, users } from "../db/schema";

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
 * A real database session for `userId`, so a spec can be signed in without
 * the email round trip. Returns the token to set as the session cookie.
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

/** Empty the Mailpit inbox so the journey always consumes its own link. */
export async function purgeMailpit(): Promise<void> {
  const response = await fetch(`${mailpitBase()}/api/v1/messages`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Mailpit purge failed (${response.status}). Is Mailpit running?`);
  }
}

interface MailpitMessage {
  ID: string;
  To?: { Address: string }[];
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
