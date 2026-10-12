/**
 * Applies committed SQL migrations (`./db/migrations`) to `DATABASE_URL`.
 * Run with `npm run db:migrate`. Uses a single-connection client and
 * ensures the `pgcrypto` extension exists for `gen_random_uuid()` defaults.
 */
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Pick up `.env.local` so the script works without exported variables.
loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DATABASE_URL is not set. Start Postgres with `docker compose up -d` and export DATABASE_URL (see .env.example)."
    );
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    await client.unsafe(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await migrate(db, { migrationsFolder: "./db/migrations" });
    console.log("Migrations applied successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
