/**
 * Sign-in rate limiting (Phase 6.1, finding F3). Server-only: the default
 * store writes to the database.
 *
 * The magic-link endpoint is the platform's only unauthenticated action with
 * an outbound side effect: without a limit, anyone can make the platform
 * send unlimited mail to arbitrary addresses (SMTP quota, deliverability and
 * domain reputation) and write unlimited verification rows.
 *
 * Two dimensions, because either alone is trivially walked around:
 * - **per address** — the durable guarantee. A caller cannot forge it: to
 *   mail-bomb a victim they must name the victim's address, and that is
 *   exactly the bucket they spend. It works even when the caller's source
 *   address is unknown or rotates.
 * - **per source IP** — defence in depth against one host working through
 *   many addresses. A forwarded-for header is only as trustworthy as the
 *   proxy that sets it (on the target hosting it is set by the platform;
 *   behind a bare Node server it is spoofable), so this dimension is
 *   deliberately the looser one and is skipped entirely when no plausible
 *   address is available — a shared "unknown" bucket would let one caller
 *   lock out everyone.
 *
 * Fixed windows rather than a sliding log: a fixed window permits a burst at
 * a boundary (here, at most 2x the limit in a moment), which is irrelevant
 * next to the cost of sending mail, and it keeps the store to one row per
 * key per window instead of one row per attempt.
 *
 * The count is incremented on every attempt and *then* judged, so a blocked
 * caller keeps the window blocked instead of resetting it.
 */
import { createHmac } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { db } from "../../db";
import { signinRateLimits } from "../../db/schema";

/**
 * Conservative pilot defaults, in one place. The address limit is what stops
 * a mail bomb; the source limit is generous because restaurants share a
 * single venue connection — a whole café signing in at lunch must not lock
 * itself out.
 */
export const SIGNIN_RATE_LIMITS = {
  email: { max: 3, windowMs: 15 * 60_000 },
  ip: { max: 20, windowMs: 15 * 60_000 },
} as const;

export type RateLimitScope = keyof typeof SIGNIN_RATE_LIMITS;

/** Stale windows are pruned once they are four windows old. */
const PRUNE_AFTER_MS = 60 * 60_000;

/** Start of the fixed window containing `now`, epoch-aligned. */
export function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/** How long until the current window rolls over. */
export function retryAfterMs(now: Date, windowMs: number): number {
  return windowStart(now, windowMs).getTime() + windowMs - now.getTime();
}

/**
 * Normalise before hashing so trivial variations share one bucket
 * (`Owner@Example.com ` and `owner@example.com` are the same person).
 */
export function normalizeRateLimitKey(scope: RateLimitScope, value: string): string {
  return scope === "email" ? value.trim().toLowerCase() : value.trim();
}

/**
 * HMAC the key. The secret keeps the stored value from being reverse-engineered
 * by brute force over a small space (addresses and IPs are both guessable), so
 * the table cannot be read as a list of who tried to sign in. Falls back to
 * `AUTH_SECRET`, which any environment that can sign anyone in must already
 * have.
 */
export function hashRateLimitKey(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function rateLimitSecret(): string {
  return process.env.SIGNIN_RATE_LIMIT_SECRET ?? process.env.AUTH_SECRET ?? "";
}

/** IPv4, or a bare IPv6 literal (brackets and zone id stripped). */
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]{2,45}$/;

/**
 * The client address from the request headers, or null. Proxies supply it
 * (comma-separated, nearest client first); a placeholder like `unknown` is
 * refused rather than becoming a bucket every caller shares.
 */
export function clientIpFrom(
  xForwardedFor: string | null | undefined,
  realIp?: string | null
): string | null {
  const first = (xForwardedFor ?? "").split(",")[0]?.trim() ?? "";
  const raw = first || (realIp ?? "").trim();
  if (!raw) return null;
  const candidate = raw.replace(/^\[/, "").replace(/\]$/, "").split("%")[0]?.toLowerCase() ?? "";
  if (IPV4.test(candidate)) return candidate;
  if (candidate.includes(":") && IPV6.test(candidate)) return candidate;
  return null;
}

/** One dimension's counter for the current window (null = not measured). */
export interface RateLimitCounts {
  email: number | null;
  ip: number | null;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Which dimension tripped — for logs and tests, never for the caller. */
  blockedBy?: RateLimitScope;
  retryAfterMs?: number;
}

/**
 * Judge the incremented counts. Pure: `count` already includes the attempt
 * being judged, so a count at the max means this attempt is the one over.
 */
export function decideSignInRateLimit(counts: RateLimitCounts, now: Date): RateLimitDecision {
  for (const scope of ["email", "ip"] as const) {
    const count = counts[scope];
    if (count === null) continue;
    const rule = SIGNIN_RATE_LIMITS[scope];
    if (count > rule.max) {
      return {
        allowed: false,
        blockedBy: scope,
        retryAfterMs: retryAfterMs(now, rule.windowMs),
      };
    }
  }
  return { allowed: true };
}

/**
 * The caller-facing refusal. Deliberately identical whatever the address is —
 * not a hint about whether an account exists — and it says when to come back
 * rather than only saying no.
 */
export function rateLimitMessage(retryAfterMsValue: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMsValue / 60_000));
  return `Too many sign-in attempts. Please wait about ${minutes} minute${
    minutes === 1 ? "" : "s"
  } and try again.`;
}

/** The refusal when the limiter itself cannot run (see `enforceSignInRateLimit`). */
export const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  "Could not send a sign-in link right now. Please try again shortly.";

/** Store seam: increment one window and return the new count. */
export interface RateLimitStore {
  increment(
    scope: RateLimitScope,
    keyHash: string,
    start: Date,
    pruneBefore: Date
  ): Promise<number>;
}

/**
 * The real store: one atomic upsert, so concurrent attempts cannot both read
 * a stale count and both be allowed. A fresh window triggers the prune, which
 * is how the table stays bounded without a scheduled job.
 */
export const databaseRateLimitStore: RateLimitStore = {
  async increment(scope, keyHash, start, pruneBefore) {
    const rows = await db
      .insert(signinRateLimits)
      .values({ scope, keyHash, windowStart: start, count: 1 })
      .onConflictDoUpdate({
        target: [signinRateLimits.scope, signinRateLimits.keyHash, signinRateLimits.windowStart],
        set: { count: sql`${signinRateLimits.count} + 1` },
      })
      .returning({ count: signinRateLimits.count });
    const count = rows[0]?.count ?? 1;
    if (count === 1) {
      await db.delete(signinRateLimits).where(lt(signinRateLimits.windowStart, pruneBefore));
    }
    return count;
  },
};

export interface SignInAttempt {
  email: string;
  ip: string | null;
  now?: Date;
  store?: RateLimitStore;
  secret?: string;
}

export type SignInRateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "limited"; message: string; blockedBy: RateLimitScope }
  | { allowed: false; reason: "unavailable"; message: string };

/**
 * Count this attempt against every available dimension and decide.
 *
 * Fails **closed** if the store errors: the database is required for sign-in
 * anyway (the verification token is written to it), so failing open would buy
 * nothing while making the limiter bypassable by inducing an error. The
 * caller gets a plain "try again shortly" rather than a stack trace.
 */
export async function enforceSignInRateLimit(
  attempt: SignInAttempt
): Promise<SignInRateLimitResult> {
  const now = attempt.now ?? new Date();
  const store = attempt.store ?? databaseRateLimitStore;
  const secret = attempt.secret ?? rateLimitSecret();

  const dimensions: { scope: RateLimitScope; value: string }[] = [
    { scope: "email", value: attempt.email },
  ];
  if (attempt.ip) dimensions.push({ scope: "ip", value: attempt.ip });

  const counts: RateLimitCounts = { email: null, ip: null };
  try {
    for (const { scope, value } of dimensions) {
      const rule = SIGNIN_RATE_LIMITS[scope];
      counts[scope] = await store.increment(
        scope,
        hashRateLimitKey(secret, normalizeRateLimitKey(scope, value)),
        windowStart(now, rule.windowMs),
        new Date(now.getTime() - PRUNE_AFTER_MS)
      );
    }
  } catch {
    return { allowed: false, reason: "unavailable", message: RATE_LIMIT_UNAVAILABLE_MESSAGE };
  }

  const decision = decideSignInRateLimit(counts, now);
  if (decision.allowed) return { allowed: true };
  return {
    allowed: false,
    reason: "limited",
    message: rateLimitMessage(decision.retryAfterMs ?? SIGNIN_RATE_LIMITS.email.windowMs),
    blockedBy: decision.blockedBy ?? "email",
  };
}
