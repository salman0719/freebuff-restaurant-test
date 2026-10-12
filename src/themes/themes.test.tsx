import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);
import type { PublicRestaurant } from "@/lib/restaurant";
import { getTheme } from "./registry";

function restaurant(overrides: Partial<PublicRestaurant> = {}): PublicRestaurant {
  return {
    slug: "marios",
    name: "Marios",
    description: "Wood-fired pizza",
    contact: { phone: "0123", email: null },
    address: {
      line1: "1 Main St",
      line2: null,
      city: "Springfield",
      postalCode: null,
      country: null,
    },
    hours: [{ weekday: 1, openTime: "09:00", closeTime: "17:00", isClosed: false }],
    menu: [
      {
        id: "cat_1",
        name: "Pizza",
        description: null,
        items: [
          { id: "item_1", name: "Margherita", description: null, priceCents: 1299, imageKey: null },
        ],
      },
    ],
    theme: "cafe",
    logoImageKey: null,
    ...overrides,
  };
}

describe.each([["cafe"], ["takeaway"]] as const)("theme %s", (id) => {
  it("renders the same public content model", () => {
    const Component = getTheme(id);
    render(<Component restaurant={restaurant()} />);
    expect(screen.getByRole("heading", { name: "Marios" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pizza" })).toBeInTheDocument();
    expect(screen.getByText(/Margherita/)).toBeInTheDocument();
    expect(screen.getByText(/12\.99/)).toBeInTheDocument();
    expect(screen.getByText(/Monday/)).toBeInTheDocument();
    expect(screen.getByText(/0123/)).toBeInTheDocument();
  });

  it("renders empty states instead of empty sections", () => {
    const Component = getTheme(id);
    render(<Component restaurant={restaurant({ menu: [], hours: [] })} />);
    expect(screen.getByText(/menu is coming soon/i)).toBeInTheDocument();
    expect(screen.getByText(/hours coming soon/i)).toBeInTheDocument();
  });
});
