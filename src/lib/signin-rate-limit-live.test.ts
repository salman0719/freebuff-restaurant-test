/**
 * Sign-in rate limiting (live database), Phase 6.1 / F3. Opt-in on
 * `TEST_DATABASE_URL` like the sibling live suites, because the claims that
 * matter here are properties of the real store: the upsert is atomic under
 * concurrency, the limit is enforced against rows that persist across
 * invocations, the address and source dimensions stay apart, the table holds
 * no raw address, and a fresh window both resets the count and prunes what
 * came before.
 *
 * **Nothing here may be imported statically.** `db/index.ts` fixes its client
 * at module load and the limiter imports it, so a top-level import of
 * `./signin-rate-limit` would pin the unconnected placeholder pool before
 * `beforeAll` can point `DATABASE_URL` at the test database — every query
 * then fails with ECONNREFUSED to port 1. Hence `libs()` and the async
 * helpers; the sibling live suites are shaped the same way for the same
 * reason.
 *
 * Rows are created under a suite-unique secret, so cleanup can delete exactly
 * the key hashes this suite produced without touching any other row.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const live = TEST_URL ? describe : describe.skip;

const SECRET = `rate-limit-live-${Date.now().toString(36)}`;
const SHARED_IP = "203.0.113.77";

live("sign-in rate limiting (live database)", () => {
  const keys: { scope: "email" | "ip"; keyHash: string }[] = [];

  async function libs() {
    process.env.DATABASE_URL = TEST_URL as string;
    const limiter = await import("./signin-rate-limit");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    const { and, eq, inArray, lt } = await import("drizzle-orm");
    return { ...limiter, schema, db, and, eq, inArray, lt };
  }

  /** The exact hash the limiter will use, so cleanup and asserts can match. */
  async function keyFor(scope: "email" | "ip", value: string): Promise<string> {
    const { hashRateLimitKey, normalizeRateLimitKey } = await libs();
    const keyHash = hashRateLimitKey(SECRET, normalizeRateLimitKey(scope, value));
    if (!keys.some((entry) => entry.keyHash === keyHash && entry.scope === scope)) {
      keys.push({ scope, keyHash });
    }
    return keyHash;
  }

  async function attempt(email: string, ip: string | null = null, now?: Date) {
    await keyFor("email", email);
    if (ip) await keyFor("ip", ip);
    return { email, ip, secret: SECRET, ...(now ? { now } : {}) };
  }

  async function rowsFor(scope: "email" | "ip", value: string) {
    const { db, schema, and, eq } = await libs();
    return db
      .select()
      .from(schema.signinRateLimits)
      .where(
        and(
          eq(schema.signinRateLimits.scope, scope),
          eq(schema.signinRateLimits.keyHash, await keyFor(scope, value))
        )
      );
  }

  beforeAll(async () => {
    // Touch the modules once so `DATABASE_URL` is pinned before any query.
    await libs();
  });

  afterAll(async () => {
    const { db, schema, and, eq } = await libs();
    for (const { scope, keyHash } of keys) {
      await db
        .delete(schema.signinRateLimits)
        .where(
          and(
            eq(schema.signinRateLimits.scope, scope),
            eq(schema.signinRateLimits.keyHash, keyHash)
          )
        );
    }
  });

  it("counts every attempt exactly, including concurrent ones", async () => {
    const { databaseRateLimitStore } = await libs();
    const email = "burst@example.com";
    const keyHash = await keyFor("email", email);
    const start = new Date("2030-01-01T00:00:00.000Z");
    const pruneBefore = new Date("2029-12-31T23:00:00.000Z");

    // Ten at once: a read-then-write limiter would let several through here,
    // which is exactly the bypass this test exists to catch.
    const counts = await Promise.all(
      Array.from({ length: 10 }, () =>
        databaseRateLimitStore.increment("email", keyHash, start, pruneBefore)
      )
    );
    expect([...counts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const rows = await rowsFor("email", email);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(10);
  });

  it("stops the address after its window is spent, and resets in the next one", async () => {
    const { enforceSignInRateLimit, SIGNIN_RATE_LIMITS } = await libs();
    const email = "limited@example.com";
    const now = new Date("2031-01-01T10:07:00.000Z");

    for (let i = 0; i < SIGNIN_RATE_LIMITS.email.max; i += 1) {
      expect(await enforceSignInRateLimit(await attempt(email, null, now))).toEqual({
        allowed: true,
      });
    }
    const blocked = await enforceSignInRateLimit(await attempt(email, null, now));
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) return expect.unreachable();
    expect(blocked.reason).toBe("limited");
    expect(blocked.message).toMatch(/Too many sign-in attempts/);

    // The counts persisted as rows, which is the property memory cannot give:
    // the next invocation reads them rather than starting over.
    const rows = await rowsFor("email", email);
    expect(rows[0]?.count).toBe(SIGNIN_RATE_LIMITS.email.max + 1);

    const nextWindow = new Date(now.getTime() + SIGNIN_RATE_LIMITS.email.windowMs);
    expect(await enforceSignInRateLimit(await attempt(email, null, nextWindow))).toEqual({
      allowed: true,
    });
    expect(await rowsFor("email", email)).toHaveLength(2);
  });

  it("shares one bucket across casing, and keeps the dimensions apart", async () => {
    const { enforceSignInRateLimit, SIGNIN_RATE_LIMITS } = await libs();
    const now = new Date("2032-01-01T10:07:00.000Z");

    // Same person, typed two ways: Auth.js lowercases identifiers too, so one
    // human must not get two allowances by capitalising differently.
    expect(await enforceSignInRateLimit(await attempt("Mixed@Example.com", null, now))).toEqual({
      allowed: true,
    });
    for (let i = 1; i < SIGNIN_RATE_LIMITS.email.max; i += 1) {
      await enforceSignInRateLimit(await attempt("mixed@example.com", null, now));
    }
    const blocked = await enforceSignInRateLimit(await attempt("MIXED@EXAMPLE.COM", null, now));
    expect(blocked.allowed).toBe(false);
    // All four attempts landed on ONE row, not two.
    expect(await rowsFor("email", "mixed@example.com")).toHaveLength(1);

    // An attempt with a source writes one row per dimension, under its own
    // scope — spending the address limit never spends the source's.
    const twoDimensions = "203.0.113.78";
    expect(
      await enforceSignInRateLimit(await attempt("both@example.com", twoDimensions, now))
    ).toEqual({ allowed: true });
    const emailRows = await rowsFor("email", "both@example.com");
    const ipRows = await rowsFor("ip", twoDimensions);
    expect([emailRows[0]?.count, ipRows[0]?.count]).toEqual([1, 1]);
    expect(ipRows[0]?.keyHash).not.toBe(emailRows[0]?.keyHash);
  });

  it("blocks a single source once it has worked through many addresses", async () => {
    const { enforceSignInRateLimit, SIGNIN_RATE_LIMITS } = await libs();
    const now = new Date("2033-01-01T10:07:00.000Z");

    // Every attempt uses a fresh address, so only the source dimension can
    // stop it — the case a per-address limit alone cannot cover.
    for (let i = 0; i < SIGNIN_RATE_LIMITS.ip.max; i += 1) {
      const result = await enforceSignInRateLimit(
        await attempt(`many-${i}@example.com`, SHARED_IP, now)
      );
      expect({ i, allowed: result.allowed }).toEqual({ i, allowed: true });
    }
    const blocked = await enforceSignInRateLimit(
      await attempt("many-final@example.com", SHARED_IP, now)
    );
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) return expect.unreachable();
    expect(blocked.reason).toBe("limited");
    expect(blocked.blockedBy).toBe("ip");
  });

  it("stores a hash, never the address or the source", async () => {
    const { db, schema, inArray } = await libs();
    const rows = await db
      .select({ scope: schema.signinRateLimits.scope, keyHash: schema.signinRateLimits.keyHash })
      .from(schema.signinRateLimits)
      .where(
        inArray(
          schema.signinRateLimits.keyHash,
          keys.map((entry) => entry.keyHash)
        )
      );
    expect(rows.length).toBeGreaterThan(0);
    const joined = JSON.stringify(rows);
    expect(joined).not.toContain("@example.com");
    expect(joined).not.toContain(SHARED_IP);
    for (const row of rows) expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("prunes windows that are long past when a new one begins", async () => {
    const { databaseRateLimitStore, db, schema, and, eq } = await libs();
    const email = "prune@example.com";
    const keyHash = await keyFor("email", email);

    await db.insert(schema.signinRateLimits).values({
      scope: "email",
      keyHash,
      windowStart: new Date("2020-01-01T00:00:00.000Z"),
      count: 9,
    });
    expect(await rowsFor("email", email)).toHaveLength(1);

    const soon = new Date();
    await databaseRateLimitStore.increment(
      "email",
      keyHash,
      new Date(Math.floor(soon.getTime() / 60_000) * 60_000),
      new Date(soon.getTime() - 60 * 60_000)
    );

    const remaining = await db
      .select()
      .from(schema.signinRateLimits)
      .where(
        and(
          eq(schema.signinRateLimits.scope, "email"),
          eq(schema.signinRateLimits.keyHash, keyHash)
        )
      );
    expect(remaining.map((row) => row.windowStart.getUTCFullYear())).toEqual([
      new Date().getUTCFullYear(),
    ]);
  });
});
