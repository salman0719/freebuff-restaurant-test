/**
 * Server-only database connection (single `postgres.js` driver behind one
 * module — see `docs/decisions/0002-open-decisions.md` §1).
 *
 * Import ONLY from server code (Server Components, route handlers, server
 * actions). Never import from client components. Moving to Neon later is a
 * `DATABASE_URL` change, not a code change.
 *
 * Import-safe by design: `postgres()` never connects on creation, so
 * importing this module is side-effect free. The exported client is a REAL
 * drizzle instance (not a Proxy) because `drizzle()` probes the client at
 * construction and adapters (e.g. `@auth/drizzle-adapter`) detect the
 * dialect from the instance. Consequences:
 * - During `next build` without `DATABASE_URL` (CI has neither the URL nor
 *   a database), an unconnected placeholder pool satisfies construction;
 *   the auth route opts out of page collection via `await connection()`,
 *   so the placeholder is never queried.
 * - At runtime without `DATABASE_URL`, the first query throws a clear
 *   error instead of a cryptic connection refusal.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // Reuse one client across dev-server reloads (ambient `var` required here).
  var __restaurantAppDbClient: postgres.Sql | undefined;
}

function underlying(): postgres.Sql {
  const existing = globalThis.__restaurantAppDbClient;
  if (existing) return existing;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return postgres("postgresql://placeholder:placeholder@localhost:1/db", { max: 1 });
    }
    throw new Error("DATABASE_URL is not set. Copy `.env.example` to `.env.local` (see README).");
  }
  const created = postgres(connectionString, { max: 10 });
  if (process.env.NODE_ENV !== "production") {
    globalThis.__restaurantAppDbClient = created;
  }
  return created;
}

export const db = drizzle(underlying(), { schema });
export type Db = typeof db;
