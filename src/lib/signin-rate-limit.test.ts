/**
 * Sign-in rate-limit unit tests (Phase 6.1, F3). Everything here runs against
 * an injected store, so the decisions are pinned without a database; the real
 * upsert, its atomicity under concurrency, and the pruning live in
 * `signin-rate-limit-live.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_UNAVAILABLE_MESSAGE,
  SIGNIN_RATE_LIMITS,
  clientIpFrom,
  decideSignInRateLimit,
  enforceSignInRateLimit,
  hashRateLimitKey,
  normalizeRateLimitKey,
  rateLimitMessage,
  retryAfterMs,
  windowStart,
  type RateLimitScope,
  type RateLimitStore,
} from "./signin-rate-limit";

const WINDOW_MS = SIGNIN_RATE_LIMITS.email.windowMs;

/** A store that counts exactly like the database one, and records its calls. */
function fakeStore(): RateLimitStore & {
  calls: { scope: RateLimitScope; keyHash: string; start: Date }[];
} {
  const windows = new Map<string, number>();
  const calls: { scope: RateLimitScope; keyHash: string; start: Date }[] = [];
  return {
    calls,
    async increment(scope, keyHash, start) {
      calls.push({ scope, keyHash, start });
      const key = `${scope}:${keyHash}:${start.toISOString()}`;
      const next = (windows.get(key) ?? 0) + 1;
      windows.set(key, next);
      return next;
    },
  };
}

describe("window arithmetic", () => {
  it("floors to the start of the window containing now", () => {
    const now = new Date("2026-01-01T12:07:30.000Z");
    expect(windowStart(now, WINDOW_MS).toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(retryAfterMs(now, WINDOW_MS)).toBe(7.5 * 60_000);
  });

  it("is stable inside one window and rolls over at the boundary", () => {
    const inside = new Date("2026-01-01T12:14:59.999Z");
    const boundary = new Date("2026-01-01T12:15:00.000Z");
    expect(windowStart(inside, WINDOW_MS).toISOString()).toBe(
      windowStart(new Date("2026-01-01T12:00:00.000Z"), WINDOW_MS).toISOString()
    );
    expect(windowStart(boundary, WINDOW_MS).getTime()).toBe(
      windowStart(inside, WINDOW_MS).getTime() + WINDOW_MS
    );
  });
});

describe("normalizeRateLimitKey", () => {
  it("folds case and padding so one person spends one bucket", () => {
    expect(normalizeRateLimitKey("email", "  Owner@Example.COM ")).toBe("owner@example.com");
    expect(normalizeRateLimitKey("ip", "  203.0.113.9 ")).toBe("203.0.113.9");
  });
});

describe("hashRateLimitKey", () => {
  it("is deterministic, opaque, and never the value itself", () => {
    const first = hashRateLimitKey("secret", "owner@example.com");
    expect(first).toBe(hashRateLimitKey("secret", "owner@example.com"));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("owner");
    expect(hashRateLimitKey("secret", "other@example.com")).not.toBe(first);
    // A different secret must not produce the same digest — otherwise the
    // value could be brute-forced out of the table.
    expect(hashRateLimitKey("other-secret", "owner@example.com")).not.toBe(first);
  });
});

describe("clientIpFrom", () => {
  it("takes the nearest client from a forwarded chain", () => {
    expect(clientIpFrom("203.0.113.9, 70.41.3.18, 150.172.238.178")).toBe("203.0.113.9");
    expect(clientIpFrom("  203.0.113.9  ")).toBe("203.0.113.9");
    expect(clientIpFrom("2001:db8::1")).toBe("2001:db8::1");
    expect(clientIpFrom("[2001:db8::1]")).toBe("2001:db8::1");
    expect(clientIpFrom("2001:db8::1%eth0")).toBe("2001:db8::1");
  });

  it("falls back to x-real-ip, and prefers the forwarded chain when both exist", () => {
    expect(clientIpFrom(null, "198.51.100.7")).toBe("198.51.100.7");
    expect(clientIpFrom("", "198.51.100.7")).toBe("198.51.100.7");
    expect(clientIpFrom("203.0.113.9", "198.51.100.7")).toBe("203.0.113.9");
  });

  it("refuses anything that is not an address, so no placeholder becomes a shared bucket", () => {
    for (const value of ["", "   ", "unknown", "not-an-ip", "example.com", "null", "-", "1.2.3"]) {
      expect({ value, ip: clientIpFrom(value) }).toEqual({ value, ip: null });
    }
  });
});

describe("decideSignInRateLimit", () => {
  const now = new Date("2026-01-01T12:07:30.000Z");

  it("allows an attempt that lands on the limit, and refuses the next", () => {
    expect(decideSignInRateLimit({ email: SIGNIN_RATE_LIMITS.email.max, ip: 1 }, now)).toEqual({
      allowed: true,
    });
    const over = decideSignInRateLimit({ email: SIGNIN_RATE_LIMITS.email.max + 1, ip: 1 }, now);
    expect(over.allowed).toBe(false);
    expect(over.blockedBy).toBe("email");
    expect(over.retryAfterMs).toBe(retryAfterMs(now, WINDOW_MS));
  });

  it("ignores a dimension that was not measured", () => {
    expect(decideSignInRateLimit({ email: 1, ip: null }, now)).toEqual({ allowed: true });
    expect(decideSignInRateLimit({ email: null, ip: null }, now)).toEqual({ allowed: true });
    // An unknown source must never block: that is the whole reason a missing
    // IP is null rather than a placeholder key.
    expect(decideSignInRateLimit({ email: 1, ip: null }, now)).toEqual({ allowed: true });
  });

  it("blocks on the source dimension too, including when the address is fresh", () => {
    const over = decideSignInRateLimit({ email: 1, ip: SIGNIN_RATE_LIMITS.ip.max + 1 }, now);
    expect(over.allowed).toBe(false);
    expect(over.blockedBy).toBe("ip");
    // The address limit is the tighter one — it is the dimension that cannot
    // be walked around by rotating sources.
    expect(SIGNIN_RATE_LIMITS.email.max).toBeLessThan(SIGNIN_RATE_LIMITS.ip.max);
  });
});

describe("rateLimitMessage", () => {
  it("says when to come back, in plain minutes", () => {
    expect(rateLimitMessage(7.5 * 60_000)).toBe(
      "Too many sign-in attempts. Please wait about 8 minutes and try again."
    );
    expect(rateLimitMessage(60_000)).toContain("about 1 minute and");
  });

  it("never mentions the address, so it cannot be read as an account oracle", () => {
    expect(rateLimitMessage(900_000)).not.toMatch(/@|exists|account|registered/i);
  });
});

describe("enforceSignInRateLimit", () => {
  const now = new Date("2026-01-01T12:07:30.000Z");

  it("allows attempts under the limit and counts every dimension once", async () => {
    const store = fakeStore();
    const result = await enforceSignInRateLimit({
      email: "owner@example.com",
      ip: "203.0.113.9",
      now,
      store,
      secret: "s",
    });
    expect(result).toEqual({ allowed: true });
    expect(store.calls.map((call) => call.scope)).toEqual(["email", "ip"]);
    expect(store.calls[0]?.start.toISOString()).toBe("2026-01-01T12:00:00.000Z");
  });

  it("enforces only the address when no source address is available", async () => {
    const store = fakeStore();
    const result = await enforceSignInRateLimit({
      email: "owner@example.com",
      ip: null,
      now,
      store,
      secret: "s",
    });
    expect(result).toEqual({ allowed: true });
    expect(store.calls.map((call) => call.scope)).toEqual(["email"]);
  });

  it("blocks once the address has spent its window, and stops sending", async () => {
    const store = fakeStore();
    const attempt = { email: "owner@example.com", ip: null, now, store, secret: "s" } as const;
    for (let i = 0; i < SIGNIN_RATE_LIMITS.email.max; i += 1) {
      expect(await enforceSignInRateLimit(attempt)).toEqual({ allowed: true });
    }
    const blocked = await enforceSignInRateLimit(attempt);
    expect(blocked.allowed).toBe(false);
    // A limit refusal, not the fail-closed path: `blockedBy` only exists once
    // the store has answered, so the reason is pinned before it is read.
    if (blocked.allowed || blocked.reason !== "limited") return expect.unreachable();
    expect(blocked.blockedBy).toBe("email");
    expect(blocked.message).toContain("Too many sign-in attempts");
  });

  it("shares one bucket across case and whitespace, and none across addresses", async () => {
    const store = fakeStore();
    const base = { ip: null, now, store, secret: "s" } as const;
    await enforceSignInRateLimit({ ...base, email: " Owner@Example.com " });
    await enforceSignInRateLimit({ ...base, email: "owner@example.com" });
    await enforceSignInRateLimit({ ...base, email: "owner@example.com" });
    const sameBucket = await enforceSignInRateLimit({ ...base, email: "owner@example.com" });
    expect(sameBucket.allowed).toBe(false);

    const otherPerson = await enforceSignInRateLimit({ ...base, email: "chef@example.com" });
    expect(otherPerson.allowed).toBe(true);
  });

  it("never hands the address or the IP to the store", async () => {
    const store = fakeStore();
    await enforceSignInRateLimit({
      email: "owner@example.com",
      ip: "203.0.113.9",
      now,
      store,
      secret: "s",
    });
    for (const call of store.calls) {
      expect(call.keyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(call.keyHash).not.toContain("example.com");
      expect(call.keyHash).not.toContain("203.0.113.9");
    }
    // Scopes are stored separately, so the two dimensions cannot collide.
    expect(store.calls[0]?.keyHash).not.toBe(store.calls[1]?.keyHash);
  });

  it("starts fresh in the next window", async () => {
    const store = fakeStore();
    const base = { email: "owner@example.com", ip: null, store, secret: "s" } as const;
    for (let i = 0; i < SIGNIN_RATE_LIMITS.email.max + 1; i += 1) {
      await enforceSignInRateLimit({ ...base, now });
    }
    const later = new Date(now.getTime() + WINDOW_MS);
    expect(await enforceSignInRateLimit({ ...base, now: later })).toEqual({ allowed: true });
  });

  it("fails closed, with a friendly message, when the store itself fails", async () => {
    const broken: RateLimitStore = {
      async increment() {
        throw new Error("connection refused");
      },
    };
    const result = await enforceSignInRateLimit({
      email: "owner@example.com",
      ip: "203.0.113.9",
      now,
      store: broken,
      secret: "s",
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return expect.unreachable();
    expect(result.reason).toBe("unavailable");
    expect(result.message).toBe(RATE_LIMIT_UNAVAILABLE_MESSAGE);
    // No internals leak to the caller.
    expect(result.message).not.toMatch(/connection|refused|Error/i);
  });
});
