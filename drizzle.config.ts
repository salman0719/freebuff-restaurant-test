import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config (see `docs/decisions/0002-open-decisions.md` §1).
 * Committed SQL lives in `./db/migrations` — always `generate` + `migrate`,
 * never `push`, so shared history stays reproducible.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    // `generate` never connects; `migrate` needs a real DATABASE_URL.
    url: process.env.DATABASE_URL ?? "postgresql://app:secret@localhost:5432/restaurant_app",
  },
});
