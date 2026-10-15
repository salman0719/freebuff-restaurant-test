import { describe, expect, it, vi } from "vitest";
import {
  getTenantContext,
  listUserTenants,
  toTenantContext,
  type TenantContext,
  type TenantListFinder,
  type TenantMembershipFinder,
  type TenantMembershipRow,
} from "./tenant-context";

const row: TenantMembershipRow = {
  tenant: {
    id: "tenant_a",
    slug: "marios",
    customDomain: null,
    customDomainStatus: "none",
    customDomainVerifyToken: null,
    published: true,
    theme: "cafe",
    themeConfig: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  membership: {
    id: "membership_1",
    userId: "user_1",
    tenantId: "tenant_a",
    role: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const session = { user: { id: "user_1", role: "owner" } };

describe("toTenantContext", () => {
  it("assembles context from a matching row", () => {
    const result = toTenantContext(row, "user_1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ctx: TenantContext = result.data;
      expect(ctx.tenant.slug).toBe("marios");
      expect(ctx.membership.role).toBe("owner");
    }
  });

  it.each([
    ["null row", null],
    ["row for another user", { ...row, membership: { ...row.membership, userId: "user_evil" } }],
  ])("returns FORBIDDEN for %s", (_label, bad) => {
    expect(toTenantContext(bad as TenantMembershipRow | null, "user_1")).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: expect.any(String) },
    });
  });
});

describe("getTenantContext", () => {
  it("resolves through the finder", async () => {
    const find: TenantMembershipFinder = vi.fn().mockResolvedValue(row);
    const result = await getTenantContext(session, "marios", find);
    expect(result.ok).toBe(true);
    expect(find).toHaveBeenCalledWith("user_1", "marios");
  });

  it("returns FORBIDDEN when the finder finds nothing", async () => {
    const find: TenantMembershipFinder = vi.fn().mockResolvedValue(null);
    expect(await getTenantContext(session, "ghost", find)).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: expect.any(String) },
    });
  });

  it("returns UNAUTHORIZED without a session", async () => {
    const find: TenantMembershipFinder = vi.fn();
    const result = await getTenantContext(null, "marios", find);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHORIZED");
    expect(find).not.toHaveBeenCalled();
  });

  it("never queries for a malformed slug", async () => {
    const find: TenantMembershipFinder = vi.fn();
    const result = await getTenantContext(session, "Bad Slug!", find);
    expect(result).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: expect.any(String) },
    });
    expect(find).not.toHaveBeenCalled();
  });
});

describe("listUserTenants", () => {
  it("returns the finder's rows for a signed-in user", async () => {
    const list: TenantListFinder = vi
      .fn()
      .mockResolvedValue([{ slug: "marios", published: true, theme: "cafe", role: "owner" }]);
    const result = await listUserTenants(session, list);
    expect(result).toEqual({
      ok: true,
      data: [{ slug: "marios", published: true, theme: "cafe", role: "owner" }],
    });
    expect(list).toHaveBeenCalledWith("user_1");
  });

  it("returns UNAUTHORIZED without a session", async () => {
    const list: TenantListFinder = vi.fn();
    const result = await listUserTenants(null, list);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHORIZED");
    expect(list).not.toHaveBeenCalled();
  });
});
