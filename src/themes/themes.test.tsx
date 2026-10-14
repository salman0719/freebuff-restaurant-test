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

/** One accent per theme, with the class that proves it reached the page. */
const ACCENT_CASE = {
  cafe: { accent: "forest", marker: "bg-emerald-50/70" },
  takeaway: { accent: "gold", marker: "bg-yellow-600" },
  bistro: { accent: "sage", marker: "bg-lime-50/60" },
  diner: { accent: "butter", marker: "bg-butter-50/70" },
} as const;

/** Themes with a tel: call CTA strip — takeaway's hero, diner's band. */
const CALL_CTA_THEMES = ["takeaway", "diner"] as const;

describe.each([["cafe"], ["takeaway"], ["bistro"], ["diner"]] as const)("theme %s", (id) => {
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
    if (!(CALL_CTA_THEMES as readonly string[]).includes(id)) return;
    const Component = getTheme(id);
    render(<Component restaurant={restaurant()} config={resolveThemeConfig(id, {})} />);
    expect(screen.getByRole("link", { name: /call 0123/i })).toHaveAttribute("href", "tel:0123");
  });

  it("omits the call CTA without a phone number", () => {
    if (!(CALL_CTA_THEMES as readonly string[]).includes(id)) return;
    const Component = getTheme(id);
    const withoutPhone = restaurant();
    withoutPhone.contact.phone = null;
    render(<Component restaurant={withoutPhone} config={resolveThemeConfig(id, {})} />);
    expect(screen.queryByRole("link", { name: /call/i })).not.toBeInTheDocument();
  });

  it("renders the logo and item photos when keys are present", () => {
    const Component = getTheme(id);
    const withImages = restaurant({
      logoImageKey: "tenants/t/logos/k.png",
      menu: [
        {
          id: "cat_1",
          name: "Pizza",
          description: null,
          items: [
            {
              id: "item_1",
              name: "Margherita",
              description: null,
              priceCents: 1299,
              imageKey: "tenants/t/items/k.png",
            },
          ],
        },
      ],
    });
    const { container } = render(
      <Component restaurant={withImages} config={resolveThemeConfig(id, {})} />
    );
    // next/image optimises through `/_next/image?url=…` with the source
    // URL-encoded inside — assert on the encoded key, not the raw path.
    expect(screen.getByRole("img", { name: "Marios logo" })).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent("/api/images/tenants/t/logos/k.png"))
    );
    // Logo plus one item photo (decorative `alt=""`, so counted via the
    // DOM, not the accessible tree); text-only menus render no <img>.
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("renders no images without keys, keeping the text layout", () => {
    const Component = getTheme(id);
    render(<Component restaurant={restaurant()} config={resolveThemeConfig(id, {})} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
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
  it("applies the configured accent palette, not just the defaults", () => {
    const Component = getTheme(id);
    const { accent, marker } = ACCENT_CASE[id];
    const config = resolveThemeConfig(id, { accent });
    const { container } = render(<Component restaurant={restaurant()} config={config} />);
    // Café, bistro, and diner tint their page surface; takeaway paints its
    // hero band.
    expect(container.innerHTML).toContain(marker);
  });

  it("honours the menu layout option", () => {
    const Component = getTheme(id);
    const config = resolveThemeConfig(id, { menuLayout: "grid" });
    const { container } = render(<Component restaurant={restaurant()} config={config} />);
    expect(container.innerHTML).toContain("sm:grid-cols-2");
  });
});
