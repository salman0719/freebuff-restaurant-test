/**
 * Server-only database connection (single `postgres.js` driver behind one
 * module — see `docs/decisions/0002-open-decisions.md` §1).
 *
 * Import ONLY from server code (Server Components, route handlers, server
 * actions). Never import from client components. Moving to Neon later is a
 * `DATABASE_URL` change, not a code change.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy `.env.example` to `.env.local` (see README).");
}

declare global {
  // Reuse one client across dev-server reloads (ambient `var` required here).
  var __restaurantAppDbClient: postgres.Sql | undefined;
}

const client = globalThis.__restaurantAppDbClient ?? postgres(connectionString, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalThis.__restaurantAppDbClient = client;
}

export const db = drizzle(client, { schema });
export type Db = typeof db;
