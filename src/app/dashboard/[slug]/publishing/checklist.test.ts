import { describe, expect, it } from "vitest";
import type { OwnerRestaurant } from "@/lib/restaurant";
import { getPublishingChecklist } from "./checklist";

type View = Pick<OwnerRestaurant, "profile" | "hours" | "categories" | "items">;

const stamp = new Date("2026-01-01T00:00:00Z");

function view(overrides: Partial<View> = {}): View {
  return {
    profile: {
      id: "profile_1",
      tenantId: "tenant_1",
      name: "Marios",
      description: null,
      phone: null,
      email: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
      logoImageKey: null,
      createdAt: stamp,
      updatedAt: stamp,
    },
    hours: [
      {
        id: "h1",
        tenantId: "tenant_1",
        weekday: 1,
        openTime: "09:00",
        closeTime: "17:00",
        isClosed: false,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    categories: [
      {
        id: "cat_1",
        tenantId: "tenant_1",
        name: "Mains",
        description: null,
        sortOrder: 0,
        isPublished: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    items: [
      {
        id: "item_1",
        tenantId: "tenant_1",
        categoryId: "cat_1",
        name: "Pizza",
        description: null,
        priceCents: 100,
        imageKey: null,
        sortOrder: 0,
        isPublished: true,
        isAvailable: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    ...overrides,
  };
}

function met(checklist: ReturnType<typeof getPublishingChecklist>): Record<string, boolean> {
  return Object.fromEntries(checklist.map((entry) => [entry.key, entry.met]));
}

describe("getPublishingChecklist", () => {
  it("marks everything met for a complete restaurant", () => {
    expect(met(getPublishingChecklist("marios", view()))).toEqual({
      profile: true,
      menu: true,
      hours: true,
    });
  });

  it("flags a missing profile, an empty menu, and unset hours", () => {
    expect(met(getPublishingChecklist("marios", view({ profile: null, hours: [] })))).toEqual({
      profile: false,
      menu: true,
      hours: false,
    });
  });

  it("treats unpublished categories and unavailable items as not ready", () => {
    const hidden = view();
    hidden.categories[0] = { ...hidden.categories[0]!, isPublished: false };
    expect(met(getPublishingChecklist("marios", hidden)).menu).toBe(false);
    const unavailable = view();
    unavailable.items[0] = { ...unavailable.items[0]!, isAvailable: false };
    expect(met(getPublishingChecklist("marios", unavailable)).menu).toBe(false);
  });

  it("links each entry to its editor", () => {
    const checklist = getPublishingChecklist("marios", view());
    expect(checklist.map((entry) => entry.href)).toEqual([
      "/dashboard/marios/profile",
      "/dashboard/marios/menu",
      "/dashboard/marios/hours",
    ]);
  });
});
