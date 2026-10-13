import { describe, expect, it } from "vitest";
import {
  assembleOwnerRestaurant,
  createTenantCategory,
  deleteTenantCategory,
  moveTenantCategory,
  ownsRow,
  updateTenantCategory,
  updateTenantHours,
  updateTenantSettings,
} from "./tenant-data";
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

describe("updateTenantHours", () => {
  it("rejects a partial week without touching the database", async () => {
    const result = await updateTenantHours(ctx, [
      { weekday: 1, openTime: "09:00", closeTime: "17:00", isClosed: false },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("rejects duplicate weekdays without touching the database", async () => {
    const days = Array.from({ length: 7 }, () => ({
      weekday: 1,
      openTime: "09:00",
      closeTime: "17:00",
      isClosed: false,
    }));
    const result = await updateTenantHours(ctx, days);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("rejects an open day missing a time without touching the database", async () => {
    const days = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      isClosed: true,
    }));
    days[2] = { weekday: 2, openTime: "09:00", isClosed: false } as never;
    const result = await updateTenantHours(ctx, days);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(result.error.fields ?? {})).toEqual(expect.arrayContaining(["2"]));
    }
  });
});

describe("category mutations", () => {
  it("rejects invalid creation input without touching the database", async () => {
    const result = await createTenantCategory(ctx, { name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(result.error.fields ?? {})).toEqual(["name"]);
    }
  });

  it("rejects invalid update input without touching the database", async () => {
    const result = await updateTenantCategory(ctx, "00000000-0000-0000-0000-000000000000", {
      name: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(result.error.fields ?? {})).toEqual(["name"]);
    }
  });

  it("rejects a cleared name without touching the database", async () => {
    const result = await updateTenantCategory(ctx, "00000000-0000-0000-0000-000000000000", {
      name: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(result.error.fields ?? {})).toEqual(["name"]);
    }
  });

  it("refuses update, delete, and move with a malformed id before any query", async () => {
    const [updated, deleted, moved] = await Promise.all([
      updateTenantCategory(ctx, "not-a-uuid", { name: "Sides" }),
      deleteTenantCategory(ctx, "not-a-uuid"),
      moveTenantCategory(ctx, "not-a-uuid", { direction: "up" }),
    ]);
    for (const result of [updated, deleted, moved]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    }
  });

  it("rejects an invalid move direction without touching the database", async () => {
    const result = await moveTenantCategory(ctx, "00000000-0000-0000-0000-000000000000", {
      direction: "sideways",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(result.error.fields ?? {})).toEqual(["direction"]);
    }
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
