/**
 * Operator tenant read tests (Phase 4.2). The finder is injected, so the
 * authorisation rule and the row mapping are exercised without a database —
 * the same seam the module uses in production.
 */
import { describe, expect, it, vi } from "vitest";
import {
  getOperatorTenant,
  toOperatorTenantSummary,
  type OperatorTenantRow,
} from "./operator-tenants";
import type { AuthenticatedUser } from "./permissions";

const staff: AuthenticatedUser = { userId: "user_staff", role: "operator" };

const row: OperatorTenantRow = {
  id: "tenant_a",
  slug: "marios-pizza",
  theme: "cafe",
  published: false,
  customDomain: null,
  profileName: "Mario's Pizza",
};

describe("toOperatorTenantSummary", () => {
  it("maps a stored row to the console's view", () => {
    expect(toOperatorTenantSummary(row)).toEqual({
      id: "tenant_a",
      slug: "marios-pizza",
      name: "Mario's Pizza",
      theme: "cafe",
      themeLabel: "Café",
      published: false,
      customDomain: null,
    });
  });

  it("resolves the theme's display label from the registry", () => {
    expect(toOperatorTenantSummary({ ...row, theme: "takeaway" }).themeLabel).toBe("Takeaway");
  });

  it("falls back to the slug when there is no profile name", () => {
    expect(toOperatorTenantSummary({ ...row, profileName: null }).name).toBe("marios-pizza");
    expect(toOperatorTenantSummary({ ...row, profileName: "   " }).name).toBe("marios-pizza");
  });

  it("falls back rather than throwing on a theme id the registry no longer knows", () => {
    // A row written before a theme was retired must still render.
    const summary = toOperatorTenantSummary({ ...row, theme: "retired-theme" });
    expect(summary.themeLabel).toBe("Café");
  });

  it("reports a recorded custom domain", () => {
    expect(toOperatorTenantSummary({ ...row, customDomain: "marios.com" }).customDomain).toBe(
      "marios.com"
    );
  });
});

describe("getOperatorTenant authorisation", () => {
  it.each([
    ["a restaurant owner", { userId: "user_owner", role: "owner" } as AuthenticatedUser],
    ["a user with no role", { userId: "user_x" } as AuthenticatedUser],
    ["a near-miss role", { userId: "user_x", role: "Operator" } as AuthenticatedUser],
    ["no identity at all", null],
    ["undefined", undefined],
  ])("refuses %s without reading anything", async (_label, act) => {
    const find = vi.fn(async () => row);
    const result = await getOperatorTenant(act, "marios-pizza", find);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(find).not.toHaveBeenCalled();
  });
});

describe("getOperatorTenant", () => {
  it("returns the summary for platform staff", async () => {
    const find = vi.fn(async () => row);
    const result = await getOperatorTenant(staff, "marios-pizza", find);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.slug).toBe("marios-pizza");
    }
    expect(find).toHaveBeenCalledWith("marios-pizza");
  });

  it("reports an unknown restaurant as null, not an error", async () => {
    const result = await getOperatorTenant(staff, "no-such-place", async () => null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });
});
