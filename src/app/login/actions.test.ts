import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestMagicLink } from "./actions";
import { parseLoginForm, safeNext } from "./login-form";

vi.mock("@/auth", () => ({ signIn: vi.fn().mockResolvedValue(undefined) }));

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
    const state = await requestMagicLink({}, form("bad"));
    expect(state.error).toEqual(expect.any(String));
    expect(signIn).not.toHaveBeenCalled();
  });

  it("delegates to the email provider for a good email", async () => {
    const { signIn } = await import("@/auth");
    await requestMagicLink({}, form("owner@example.com", "/dashboard/marios"));
    expect(signIn).toHaveBeenCalledWith("nodemailer", {
      email: "owner@example.com",
      redirectTo: "/dashboard/marios",
    });
  });
});
