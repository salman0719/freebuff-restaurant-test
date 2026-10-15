/**
 * Operator tenant read tests (Phase 4.2/4.3). The finder is injected, so both
 * the authorisation rule and the mapping are exercised without a database —
 * the same seam the module uses in production.
 */
import { describe, expect, it, vi } from "vitest";
import {
  getTenantSetup,
  listTenantSetups,
  toOperatorTenantSummary,
  toTenantSetup,
  type OperatorTenantRow,
  type TenantSetupFacts,
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

function facts(overrides: Partial<TenantSetupFacts> = {}): TenantSetupFacts {
  return {
    summary: row,
    profile: { name: "Mario's Pizza" },
    categories: [],
    items: [],
    hours: [],
    ownerCount: 0,
    ...overrides,
  };
}

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
    expect(toOperatorTenantSummary({ ...row, theme: "retired-theme" }).themeLabel).toBe("Café");
  });
});

describe("toTenantSetup", () => {
  it("attaches the checklist and its summary to the tenant", () => {
    const setup = toTenantSetup(facts());
    expect(setup.slug).toBe("marios-pizza");
    expect(setup.summary).toEqual({ met: 2, total: 7, complete: false });
    expect(setup.steps.map((step) => step.key)).toContain("menu");
  });

  it("notices a menu, hours, and an owner", () => {
    const setup = toTenantSetup(
      facts({
        categories: [{ id: "c1", isPublished: true }],
        items: [{ categoryId: "c1", isPublished: true, isAvailable: true }],
        hours: [{ openTime: "09:00", isClosed: false }],
        ownerCount: 1,
        summary: { ...row, published: true },
      })
    );
    expect(setup.summary).toEqual({ met: 6, total: 7, complete: false });
  });

  it("treats a missing profile row as a missing profile", () => {
    const setup = toTenantSetup(facts({ profile: null }));
    expect(setup.steps.find((step) => step.key === "profile")?.met).toBe(false);
  });
});

describe("staff authorisation", () => {
  const refused: [string, AuthenticatedUser | null | undefined][] = [
    ["a restaurant owner", { userId: "user_owner", role: "owner" }],
    ["a user with no role", { userId: "user_x" } as AuthenticatedUser],
    ["a near-miss role", { userId: "user_x", role: "Operator" }],
    ["no identity at all", null],
    ["undefined", undefined],
  ];

  it.each(refused)("listTenantSetups refuses %s without reading anything", async (_label, act) => {
    const find = vi.fn(async () => [facts()]);
    const result = await listTenantSetups(act, find);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(find).not.toHaveBeenCalled();
  });

  it.each(refused)("getTenantSetup refuses %s without reading anything", async (_label, act) => {
    const find = vi.fn(async () => [facts()]);
    const result = await getTenantSetup(act, "marios-pizza", find);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(find).not.toHaveBeenCalled();
  });
});

describe("listTenantSetups", () => {
  it("returns every tenant", async () => {
    const find = vi.fn(async () => [
      facts(),
      facts({ summary: { ...row, id: "tenant_b", slug: "night-market" } }),
    ]);
    const result = await listTenantSetups(staff, find);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((setup) => setup.slug)).toEqual(["marios-pizza", "night-market"]);
    }
  });

  it("returns an empty list for a platform with no tenants", async () => {
    const result = await listTenantSetups(staff, async () => []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
  });
});

describe("getTenantSetup", () => {
  it("returns the setup for platform staff", async () => {
    const find = vi.fn(async () => [facts()]);
    const result = await getTenantSetup(staff, "marios-pizza", find);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.slug).toBe("marios-pizza");
    }
    expect(find).toHaveBeenCalledWith("marios-pizza");
  });

  it("reports an unknown restaurant as null, not an error", async () => {
    const result = await getTenantSetup(staff, "no-such-place", async () => []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });
});
