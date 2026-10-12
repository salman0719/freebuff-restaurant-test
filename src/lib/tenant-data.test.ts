import { describe, expect, it } from "vitest";
import { assembleOwnerRestaurant, ownsRow, updateTenantSettings } from "./tenant-data";
import type { TenantContext as Ctx } from "./tenant-context";

const ctx: Ctx = {
  tenant: {
    id: "tenant_a",
    slug: "marios",
    customDomain: null,
    published: true,
    theme: "cafe",
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

describe("ownsRow", () => {
  it("accepts rows of the context tenant", () => {
    expect(ownsRow(ctx, { tenantId: "tenant_a" })).toBe(true);
  });

  it("rejects rows of another tenant", () => {
    expect(ownsRow(ctx, { tenantId: "tenant_b" })).toBe(false);
  });
});

describe("assembleOwnerRestaurant", () => {
  it("composes the private view with the membership role", () => {
    const view = assembleOwnerRestaurant(ctx, null, [], [], []);
    expect(view.tenant.id).toBe("tenant_a");
    expect(view.profile).toBeNull();
    expect(view.membershipRole).toBe("owner");
  });
});

describe("updateTenantSettings", () => {
  it("rejects invalid input without touching the database", async () => {
    const result = await updateTenantSettings(ctx, { theme: "neon" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(result.error.fields ?? {})).toEqual(["theme"]);
    }
  });

  it("treats an empty update as a no-op returning the current tenant", async () => {
    await expect(updateTenantSettings(ctx, {})).resolves.toEqual({ ok: true, data: ctx.tenant });
  });
});
