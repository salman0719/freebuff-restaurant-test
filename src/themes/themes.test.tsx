import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);
import type { PublicRestaurant } from "@/lib/restaurant";
import { resolveThemeConfig } from "./config";
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
    themeConfig: {},
    logoImageKey: null,
    ...overrides,
  };
}

describe.each([["cafe"], ["takeaway"]] as const)("theme %s", (id) => {
  it("renders the same public content model", () => {
    const Component = getTheme(id);
    render(<Component restaurant={restaurant()} config={resolveThemeConfig(id, {})} />);
    expect(screen.getByRole("heading", { name: "Marios" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pizza" })).toBeInTheDocument();
    expect(screen.getByText(/Margherita/)).toBeInTheDocument();
    expect(screen.getByText(/12\.99/)).toBeInTheDocument();
    expect(screen.getByText(/Monday/)).toBeInTheDocument();
    // At least one rendering of the phone number — takeaway repeats it in
    // the call CTA and the contact block, which is intentional, not a bug.
    expect(screen.getAllByText(/0123/).length).toBeGreaterThanOrEqual(1);
  });

  it("offers a call CTA when a phone number exists", () => {
    if (id !== "takeaway") return;
    const Component = getTheme(id);
    render(<Component restaurant={restaurant()} config={resolveThemeConfig(id, {})} />);
    expect(screen.getByRole("link", { name: /call 0123/i })).toHaveAttribute("href", "tel:0123");
  });

  it("omits the call CTA without a phone number", () => {
    if (id !== "takeaway") return;
    const Component = getTheme(id);
    const withoutPhone = restaurant();
    withoutPhone.contact.phone = null;
    render(<Component restaurant={withoutPhone} config={resolveThemeConfig(id, {})} />);
    expect(screen.queryByRole("link", { name: /call/i })).not.toBeInTheDocument();
  });

  it("renders empty states instead of empty sections", () => {
    const Component = getTheme(id);
    render(
      <Component
        restaurant={restaurant({ menu: [], hours: [] })}
        config={resolveThemeConfig(id, {})}
      />
    );
    expect(screen.getByText(/menu is coming soon/i)).toBeInTheDocument();
    expect(screen.getByText(/hours coming soon/i)).toBeInTheDocument();
  });
});
