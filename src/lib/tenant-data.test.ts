import { describe, expect, it } from "vitest";
import {
  assembleOwnerRestaurant,
  clearTenantItemImage,
  createTenantCategory,
  createTenantItem,
  deleteTenantCategory,
  moveTenantCategory,
  ownsRow,
  deleteTenantItem,
  setTenantItemImage,
  setTenantLogo,
  updateTenantCategory,
  updateTenantHours,
  updateTenantItem,
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

describe("item mutations", () => {
  it("rejects invalid creation input without touching the database", async () => {
    const bad = await createTenantItem(ctx, { name: "", priceCents: -1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(bad.error.fields ?? {}).sort()).toEqual(["name", "priceCents"]);
    }
    const missing = await createTenantItem(ctx, { name: "Pizza" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(missing.error.fields ?? {})).toEqual(["priceCents"]);
    }
  });

  it("rejects a non-uuid category id before any query", async () => {
    const result = await createTenantItem(ctx, {
      name: "Pizza",
      priceCents: 100,
      categoryId: "not-a-uuid",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects invalid update input without touching the database", async () => {
    const bad = await updateTenantItem(ctx, "00000000-0000-0000-0000-000000000000", {
      priceCents: -5,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(bad.error.fields ?? {})).toEqual(["priceCents"]);
    }
    const cleared = await updateTenantItem(ctx, "00000000-0000-0000-0000-000000000000", {
      name: null,
    });
    expect(cleared.ok).toBe(false);
    if (!cleared.ok) {
      expect(cleared.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(cleared.error.fields ?? {})).toEqual(["name"]);
    }
  });

  it("refuses update and delete with a malformed id before any query", async () => {
    const [updated, deleted] = await Promise.all([
      updateTenantItem(ctx, "not-a-uuid", { name: "Pizza" }),
      deleteTenantItem(ctx, "not-a-uuid"),
    ]);
    for (const result of [updated, deleted]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    }
  });
});

describe("image mutations", () => {
  it("rejects a non-image logo without touching the database", async () => {
    const result = await setTenantLogo(ctx, "not a file");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(result.error.fields ?? {})).toEqual(["image"]);
    }
  });

  it("rejects a non-image item photo without touching the database", async () => {
    const result = await setTenantItemImage(
      ctx,
      "00000000-0000-0000-0000-000000000000",
      "not a file"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(result.error.fields ?? {})).toEqual(["image"]);
    }
  });

  it("refuses photo removal on a malformed id before any query", async () => {
    const result = await clearTenantItemImage(ctx, "not-a-uuid");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
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
