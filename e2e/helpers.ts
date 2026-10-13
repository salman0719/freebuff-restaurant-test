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
import { memberships, tenants, users } from "../db/schema";

loadEnvConfig(process.cwd());

export const E2E_EMAIL = "owner-e2e@example.com";
export const E2E_SLUG = "e2e-bistro";
export const E2E_NAME = "E2E Bistro";

export function mailpitBase(): string {
  return process.env.MAILPIT_URL ?? "http://localhost:8025";
}

function seedDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Start Postgres (`docker compose up -d`) first.");
  }
  return drizzle(postgres(url, { max: 1 }));
}

/** Reset the journey tenant to a fresh draft owned by the journey user. */
export async function seedOwnerJourney(): Promise<void> {
  const db = seedDb();
  await db.delete(tenants).where(eq(tenants.slug, E2E_SLUG));
  await db.delete(users).where(eq(users.email, E2E_EMAIL));
  const [user] = await db.insert(users).values({ email: E2E_EMAIL }).returning({ id: users.id });
  const [tenant] = await db
    .insert(tenants)
    .values({ slug: E2E_SLUG })
    .returning({ id: tenants.id });
  await db.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: "owner" });
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
