import { describe, expect, it } from "vitest";
import { toPreviewRestaurant, type PreviewSource } from "./preview-restaurant";

function source(overrides: Partial<PreviewSource> = {}): PreviewSource {
  const stamp = new Date("2026-01-01T00:00:00Z");
  return {
    tenant: {
      id: "tenant_1",
      slug: "marios",
      customDomain: null,
      published: false,
      theme: "takeaway",
      themeConfig: {},
      createdAt: stamp,
      updatedAt: stamp,
    },
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
    hours: [],
    categories: [],
    items: [],
    ...overrides,
  };
}

describe("toPreviewRestaurant", () => {
  it("includes unpublished categories and items the public view would drop", () => {
    const stamp = new Date("2026-01-01T00:00:00Z");
    const view = toPreviewRestaurant(
      source({
        categories: [
          {
            id: "cat_1",
            tenantId: "tenant_1",
            name: "Draft menu",
            description: null,
            sortOrder: 0,
            isPublished: false,
            createdAt: stamp,
            updatedAt: stamp,
          },
        ],
        items: [
          {
            id: "item_1",
            tenantId: "tenant_1",
            categoryId: "cat_1",
            name: "Secret pizza",
            description: null,
            priceCents: 100,
            imageKey: null,
            sortOrder: 0,
            isPublished: false,
            isAvailable: false,
            createdAt: stamp,
            updatedAt: stamp,
          },
        ],
      })
    );
    expect(view.menu.map((category) => category.name)).toEqual(["Draft menu"]);
    expect(view.menu[0]?.items.map((item) => item.name)).toEqual(["Secret pizza"]);
  });

  it("groups uncategorised items under a Menu section", () => {
    const stamp = new Date("2026-01-01T00:00:00Z");
    const view = toPreviewRestaurant(
      source({
        items: [
          {
            id: "item_9",
            tenantId: "tenant_1",
            categoryId: null,
            name: "Loose fries",
            description: null,
            priceCents: 200,
            imageKey: null,
            sortOrder: 0,
            isPublished: true,
            isAvailable: true,
            createdAt: stamp,
            updatedAt: stamp,
          },
        ],
      })
    );
    expect(view.menu.map((category) => category.name)).toEqual(["Menu"]);
  });

  it("carries the tenant theme, hours, and contact through", () => {
    const view = toPreviewRestaurant(
      source({
        hours: [
          {
            id: "h1",
            tenantId: "tenant_1",
            weekday: 1,
            openTime: "09:00",
            closeTime: "17:00",
            isClosed: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      })
    );
    expect(view.theme).toBe("takeaway");
    expect(view.hours).toHaveLength(1);
    expect(view.slug).toBe("marios");
  });
});
