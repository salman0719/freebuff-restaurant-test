import { describe, expect, it } from "vitest";
import {
  assignMembershipSchema,
  createCategorySchema,
  createItemSchema,
  createTenantSchema,
  inviteOwnerSchema,
  openingHoursSchema,
  slugSchema,
  themeSchema,
  updateCategorySchema,
  updateHoursSchema,
  updateItemSchema,
  updateTenantSchema,
  validationFields,
} from "./validation";

describe("slugSchema", () => {
  it("accepts a well-formed slug", () => {
    expect(slugSchema.safeParse("marios-pizza").success).toBe(true);
  });

  it.each(["Bad Slug!", "Marios", "marios_pizza", "marios--pizza", "-marios", ""])(
    "rejects malformed slug %s",
    (slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    }
  );

  it.each(["www", "api", "app", "admin"])("rejects reserved slug %s", (slug) => {
    const result = slugSchema.safeParse(slug);
    expect(result.success).toBe(false);
  });

  it("rejects slugs over 63 characters", () => {
    expect(slugSchema.safeParse("a".repeat(64)).success).toBe(false);
  });
});

describe("themeSchema", () => {
  it.each(["cafe", "takeaway", "bistro", "diner"])("accepts theme %s", (theme) => {
    expect(themeSchema.safeParse(theme).success).toBe(true);
  });

  it("rejects unknown themes", () => {
    expect(themeSchema.safeParse("neon").success).toBe(false);
  });
});

describe("createTenantSchema", () => {
  it("applies safe defaults", () => {
    const result = createTenantSchema.safeParse({ slug: "marios", name: "Marios" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.theme).toBe("cafe");
      expect(result.data.published).toBe(false);
    }
  });
});

describe("updateTenantSchema", () => {
  it("has no slug field — renames need a redirect flow, not an edit", () => {
    expect("slug" in updateTenantSchema.shape).toBe(false);
  });

  it("accepts a partial update", () => {
    expect(updateTenantSchema.safeParse({ published: true }).success).toBe(true);
  });
});

describe("openingHoursSchema", () => {
  it("accepts an open day with both times", () => {
    expect(
      openingHoursSchema.safeParse({ weekday: 1, openTime: "09:00", closeTime: "17:00" }).success
    ).toBe(true);
  });

  it("accepts overnight ranges", () => {
    expect(
      openingHoursSchema.safeParse({ weekday: 5, openTime: "18:00", closeTime: "02:00" }).success
    ).toBe(true);
  });

  it("accepts a closed day without times", () => {
    expect(openingHoursSchema.safeParse({ weekday: 0, isClosed: true }).success).toBe(true);
  });

  it("rejects a closed day carrying times", () => {
    expect(
      openingHoursSchema.safeParse({ weekday: 0, isClosed: true, openTime: "09:00" }).success
    ).toBe(false);
  });

  it("rejects an open day missing a time", () => {
    expect(openingHoursSchema.safeParse({ weekday: 2, openTime: "09:00" }).success).toBe(false);
  });

  it.each([7, -1])("rejects weekday %s", (weekday) => {
    expect(
      openingHoursSchema.safeParse({ weekday, openTime: "09:00", closeTime: "17:00" }).success
    ).toBe(false);
  });

  it("rejects malformed times", () => {
    expect(
      openingHoursSchema.safeParse({ weekday: 2, openTime: "9am", closeTime: "17:00" }).success
    ).toBe(false);
  });
});

describe("updateHoursSchema", () => {
  const openWeek = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    openTime: "09:00",
    closeTime: "17:00",
    isClosed: false,
  }));

  it("accepts a full open week", () => {
    expect(updateHoursSchema.safeParse(openWeek).success).toBe(true);
  });

  it("accepts a mixed week with closed days carrying no times", () => {
    const week = openWeek.map((day) => (day.weekday === 0 ? { weekday: 0, isClosed: true } : day));
    expect(updateHoursSchema.safeParse(week).success).toBe(true);
  });

  it("rejects a partial week", () => {
    expect(updateHoursSchema.safeParse(openWeek.slice(0, 6)).success).toBe(false);
  });

  it("rejects duplicate weekdays", () => {
    const week = openWeek.map((day) => ({ ...day, weekday: 1 }));
    const result = updateHoursSchema.safeParse(week);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Each weekday must appear exactly once."
      );
    }
  });

  it("rejects malformed times through the per-day schema", () => {
    const week = openWeek.map((day) => (day.weekday === 2 ? { ...day, openTime: "9am" } : day));
    expect(updateHoursSchema.safeParse(week).success).toBe(false);
  });
});

describe("menu schemas", () => {
  it("accepts a category with defaults", () => {
    const result = createCategorySchema.safeParse({ name: "Mains" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
      expect(result.data.isPublished).toBe(true);
    }
  });

  it("rejects negative and fractional prices", () => {
    expect(createItemSchema.safeParse({ name: "Pizza", priceCents: -1 }).success).toBe(false);
    expect(createItemSchema.safeParse({ name: "Pizza", priceCents: 12.99 }).success).toBe(false);
  });

  it("accepts a free item with defaults", () => {
    const result = createItemSchema.safeParse({ name: "Tap water", priceCents: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isPublished).toBe(true);
      expect(result.data.isAvailable).toBe(true);
    }
  });

  it("rejects non-uuid category ids", () => {
    expect(
      createItemSchema.safeParse({ name: "Pizza", priceCents: 100, categoryId: "nope" }).success
    ).toBe(false);
  });

  it("accepts partial category and item updates", () => {
    expect(updateCategorySchema.safeParse({ name: "Sides" }).success).toBe(true);
    expect(updateItemSchema.safeParse({ isAvailable: false }).success).toBe(true);
  });
});

describe("membership schemas", () => {
  it("defaults the role to owner", () => {
    const result = assignMembershipSchema.safeParse({ userId: "user_1" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe("owner");
  });

  it("validates invite emails", () => {
    expect(inviteOwnerSchema.safeParse({ email: "owner@example.com" }).success).toBe(true);
    expect(inviteOwnerSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("validationFields", () => {
  it("maps issues to field-keyed messages", () => {
    const result = createItemSchema.safeParse({ name: "", priceCents: -5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = validationFields(result.error);
      expect(Object.keys(fields).sort()).toEqual(["name", "priceCents"]);
      expect(fields["priceCents"]?.[0]).toMatch(/negative/i);
    }
  });
});
