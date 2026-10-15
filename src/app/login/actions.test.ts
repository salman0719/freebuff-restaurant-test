import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestMagicLink } from "./actions";
import { parseLoginForm, safeNext } from "./login-form";

vi.mock("@/auth", () => ({ signIn: vi.fn().mockResolvedValue(undefined) }));

// The limiter's own behaviour is covered by `signin-rate-limit.test.ts` and
// its live suite; here it is a seam, so the action's contract can be pinned
// without a database. `next/headers` has no request context under vitest.
vi.mock("@/lib/signin-rate-limit", () => ({
  clientIpFrom: vi.fn(() => "203.0.113.9"),
  enforceSignInRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

function form(email: string, next?: string): FormData {
  const data = new FormData();
  data.set("email", email);
  if (next !== undefined) data.set("next", next);
  return data;
}

describe("safeNext", () => {
  it.each([["/dashboard/marios"], ["/"]])("keeps the safe same-origin path %s", (value) => {
    expect(safeNext(value)).toBe(value);
  });

  it.each([["https://evil.test"], ["//evil.test/x"], ["/\\evil"], [undefined]])(
    "falls back to /dashboard for %s",
    (value) => {
      expect(safeNext(value)).toBe("/dashboard");
    }
  );
});

describe("parseLoginForm", () => {
  it("accepts a valid email and honours a safe next path", () => {
    expect(parseLoginForm(form("  owner@example.com ", "/dashboard/marios"))).toEqual({
      ok: true,
      email: "owner@example.com",
      next: "/dashboard/marios",
    });
  });

  it("rejects a malformed email and echoes the input", () => {
    const parsed = parseLoginForm(form("not-an-email"));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toEqual(expect.any(String));
      expect(parsed.email).toBe("not-an-email");
    }
  });

  it("falls back when next points off-site", () => {
    const parsed = parseLoginForm(form("owner@example.com", "https://evil.test"));
    expect(parsed).toEqual({ ok: true, email: "owner@example.com", next: "/dashboard" });
  });
});

describe("requestMagicLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an error without calling signIn for a bad email", async () => {
    const { signIn } = await import("@/auth");
    const { enforceSignInRateLimit } = await import("@/lib/signin-rate-limit");
    const state = await requestMagicLink({}, form("bad"));
    expect(state.error).toEqual(expect.any(String));
    expect(signIn).not.toHaveBeenCalled();
    // Malformed input is refused before anything is spent on it.
    expect(enforceSignInRateLimit).not.toHaveBeenCalled();
  });

  it("delegates to the email provider for a good email, after counting the attempt", async () => {
    const { signIn } = await import("@/auth");
    const { clientIpFrom, enforceSignInRateLimit } = await import("@/lib/signin-rate-limit");
    await requestMagicLink({}, form("owner@example.com", "/dashboard/marios"));
    expect(enforceSignInRateLimit).toHaveBeenCalledWith({
      email: "owner@example.com",
      ip: "203.0.113.9",
    });
    expect(clientIpFrom).toHaveBeenCalledWith("203.0.113.9", null);
    expect(signIn).toHaveBeenCalledWith("nodemailer", {
      email: "owner@example.com",
      redirectTo: "/dashboard/marios",
    });
  });

  it("never sends mail once the limiter refuses, and keeps the typed address", async () => {
    const { signIn } = await import("@/auth");
    const { enforceSignInRateLimit } = await import("@/lib/signin-rate-limit");
    vi.mocked(enforceSignInRateLimit).mockResolvedValueOnce({
      allowed: false,
      reason: "limited",
      message: "Too many sign-in attempts. Please wait about 8 minutes and try again.",
      blockedBy: "email",
    });

    const state = await requestMagicLink({}, form("  Owner@Example.com  "));
    expect(state.error).toBe(
      "Too many sign-in attempts. Please wait about 8 minutes and try again."
    );
    expect(state.email).toBe("Owner@Example.com");
    // The whole point of F3: no mail leaves the platform for a refused attempt.
    expect(signIn).not.toHaveBeenCalled();
  });

  it("reports an unavailable limiter as an error rather than sending anyway", async () => {
    const { signIn } = await import("@/auth");
    const { enforceSignInRateLimit } = await import("@/lib/signin-rate-limit");
    vi.mocked(enforceSignInRateLimit).mockResolvedValueOnce({
      allowed: false,
      reason: "unavailable",
      message: "Could not send a sign-in link right now. Please try again shortly.",
    });

    const state = await requestMagicLink({}, form("owner@example.com"));
    expect(state.error).toContain("try again shortly");
    expect(signIn).not.toHaveBeenCalled();
  });
});
