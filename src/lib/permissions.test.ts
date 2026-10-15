import { describe, expect, it } from "vitest";
import {
  requireOperator,
  requireTenantMember,
  requireTenantRole,
  requireUser,
  type AuthSession,
  type MembershipRow,
} from "./permissions";

const ownerSession: AuthSession = { user: { id: "user_1", role: "owner" } };
const operatorSession: AuthSession = { user: { id: "user_9", role: "operator" } };
const ownerMembership: MembershipRow = { userId: "user_1", tenantId: "tenant_a", role: "owner" };

describe("requireUser", () => {
  it("returns the identity for a signed-in session", () => {
    expect(requireUser(ownerSession)).toEqual({
      ok: true,
      data: { userId: "user_1", role: "owner" },
    });
  });

  it("defaults a missing role to owner", () => {
    expect(requireUser({ user: { id: "user_2" } })).toEqual({
      ok: true,
      data: { userId: "user_2", role: "owner" },
    });
  });

  it.each([[null], [{}], [{ user: null }]])("rejects %s as UNAUTHORIZED", (session) => {
    const result = requireUser(session as AuthSession);
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED", message: expect.any(String) },
    });
  });
});

describe("requireOperator", () => {
  it("accepts a global operator", () => {
    expect(requireOperator(operatorSession).ok).toBe(true);
  });

  it("rejects a global owner as FORBIDDEN", () => {
    expect(requireOperator(ownerSession)).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: expect.any(String) },
    });
  });

  it("rejects anonymous callers as UNAUTHORIZED", () => {
    const result = requireOperator(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("never accepts a role the platform does not define", () => {
    // The role vocabulary is the database CHECK's: owner or operator, exactly.
    // Anything else — including a plausible-looking "admin" — is FORBIDDEN.
    for (const role of ["admin", "Administrator", "root", "staff", "owner operator"]) {
      const result = requireOperator({ user: { id: "user_x", role } });
      expect(result.ok, `${role} must not be treated as staff`).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    }
  });
});

describe("requireTenantRole", () => {
  it("accepts a matching membership with an allowed role", () => {
    expect(requireTenantRole(ownerSession, ownerMembership, ["owner"])).toEqual({
      ok: true,
      data: ownerMembership,
    });
  });

  it("rejects when the role is not allowed", () => {
    expect(requireTenantRole(ownerSession, ownerMembership, ["operator"])).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: expect.any(String) },
    });
  });

  it("rejects a missing row without leaking existence", () => {
    const result = requireTenantRole(ownerSession, null);
    expect(result).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: expect.any(String) },
    });
  });

  it("rejects a row belonging to another user", () => {
    const foreign: MembershipRow = { ...ownerMembership, userId: "user_evil" };
    expect(requireTenantRole(ownerSession, foreign).ok).toBe(false);
  });

  it("rejects anonymous callers as UNAUTHORIZED", () => {
    const result = requireTenantRole(null, ownerMembership);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("proves a global owner role alone grants nothing", () => {
    // Signed in as owner, but no membership row for this tenant.
    expect(requireTenantMember(ownerSession, null).ok).toBe(false);
  });
});
