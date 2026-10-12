import { describe, expect, it } from "vitest";
import { toPublicRestaurant, type PublicRestaurantRows } from "./public-restaurant";

function rows(overrides: Partial<PublicRestaurantRows> = {}): PublicRestaurantRows {
  return {
    tenant: {
      id: "tenant_a",
      slug: "marios",
      customDomain: null,
      published: true,
      theme: "cafe",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    profile: {
      id: "profile_1",
      tenantId: "tenant_a",
      name: "Marios",
      description: "Wood-fired pizza",
      phone: "0123",
      email: null,
      addressLine1: null,
      addressLine2: null,
      city: "Springfield",
      postalCode: null,
      country: null,
      logoImageKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    hours: [],
    categories: [
      {
        id: "cat_1",
        tenantId: "tenant_a",
        name: "Pizza",
        description: null,
        sortOrder: 0,
        isPublished: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    items: [
      {
        id: "item_1",
        tenantId: "tenant_a",
        categoryId: "cat_1",
        name: "Margherita",
        description: null,
        priceCents: 1299,
        imageKey: null,
        sortOrder: 0,
        isPublished: true,
        isAvailable: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    ...overrides,
  };
}

describe("toPublicRestaurant", () => {
  it("maps the full published view", () => {
    const view = toPublicRestaurant(rows());
    expect(view.slug).toBe("marios");
    expect(view.name).toBe("Marios");
    expect(view.theme).toBe("cafe");
    expect(view.menu).toHaveLength(1);
    expect(view.menu[0].items.map((item) => item.name)).toEqual(["Margherita"]);
  });

  it("drops unpublished categories and unavailable items", () => {
    const base = rows();
    const view = toPublicRestaurant({
      ...base,
      categories: [
        { ...base.categories[0], id: "cat_draft", name: "Draft", isPublished: false },
        base.categories[0],
      ],
      items: [
        ...base.items,
        { ...base.items[0], id: "item_hidden", name: "Hidden", isPublished: false },
        { ...base.items[0], id: "item_soldout", name: "Sold out", isAvailable: false },
      ],
    });
    expect(view.menu.map((category) => category.name)).toEqual(["Pizza"]);
    expect(view.menu[0].items.map((item) => item.name)).toEqual(["Margherita"]);
  });

  it("drops categories left with no visible items", () => {
    const base = rows();
    const view = toPublicRestaurant({
      ...base,
      categories: [
        ...base.categories,
        {
          ...base.categories[0],
          id: "cat_empty",
          name: "Empty",
          description: null,
        },
      ],
    });
    expect(view.menu.map((category) => category.name)).toEqual(["Pizza"]);
  });

  it("renders without a profile using the slug as the name", () => {
    const view = toPublicRestaurant(rows({ profile: null }));
    expect(view.name).toBe("marios");
    expect(view.contact).toEqual({ phone: null, email: null });
    expect(view.menu).toHaveLength(1);
  });

  it("exposes no internal, membership, or config data", () => {
    const view = toPublicRestaurant(rows());
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/user_id|membership|AUTH_SECRET|customDomain/);
    expect(view).not.toHaveProperty("published");
    expect(view).not.toHaveProperty("tenantId");
  });
});
