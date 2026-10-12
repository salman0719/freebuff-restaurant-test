/**
 * Server-only database connection (single `postgres.js` driver behind one
 * module — see `docs/decisions/0002-open-decisions.md` §1).
 *
 * Import ONLY from server code (Server Components, route handlers, server
 * actions). Never import from client components. Moving to Neon later is a
 * `DATABASE_URL` change, not a code change.
 *
 * Import-safe by design: importing this module never connects and never
 * throws, so `next build`, `tsc`, and unit tests run without `DATABASE_URL`
 * (CI has neither the URL nor a database). The client is created on first
 * query; only then is a missing `DATABASE_URL` reported.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function missingUrl(): never {
  throw new Error(
    "DATABASE_URL is not set. Copy `.env.example` to `.env.local` (see README).",
  );
}

declare global {
  // Reuse one client across dev-server reloads (ambient `var` required here).
  var __restaurantAppDbClient: postgres.Sql | undefined;
}

function client(): postgres.Sql {
  const existing = globalThis.__restaurantAppDbClient;
  if (existing) return existing;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) missingUrl();
  const created = postgres(connectionString, { max: 10 });
  if (process.env.NODE_ENV !== "production") {
    globalThis.__restaurantAppDbClient = created;
  }
  return created;
}

/**
 * Lazily-connected Drizzle client. Property access forwards to the real
 * client, creating it on first use.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, property, receiver) {
    return Reflect.get(drizzle(client(), { schema }), property, receiver);
  },
});

export type Db = typeof db;
