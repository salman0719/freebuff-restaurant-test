/**
 * Owner preview model (Phase 3.7). Pure assembly — no I/O, so pages and
 * tests share it freely.
 *
 * Builds the same `PublicRestaurant` shape the themes render, but from the
 * membership-gated owner view with NOTHING filtered: unpublished
 * categories, unpublished/unavailable items, and all hours rows are
 * included, so owners see exactly what saving + publishing would put
 * live. Publication stays the authorisation for the real public surface
 * (`getPublicRestaurant` still filters); this view must only ever be
 * built from a context the membership check produced, and rendered behind
 * the dashboard gate — never on a public route.
 */
import { toPublicMenuItem } from "./public-restaurant";
import type {
  MenuCategory,
  MenuItem,
  OpeningHoursRow,
  PublicMenuCategory,
  PublicMenuItem,
  PublicRestaurant,
  RestaurantProfile,
  Tenant,
} from "./restaurant";

export interface PreviewSource {
  tenant: Tenant;
  profile: RestaurantProfile | null;
  hours: OpeningHoursRow[];
  categories: MenuCategory[];
  items: MenuItem[];
}

/** Draft-inclusive assembly: every category and item renders. */
export function toPreviewRestaurant(source: PreviewSource): PublicRestaurant {
  const { tenant, profile, hours, categories, items } = source;
  const menu: PublicMenuCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    items: items.filter((item) => item.categoryId === category.id).map(toPublicMenuItem),
  }));
  const uncategorised: PublicMenuItem[] = items
    .filter((item) => item.categoryId == null)
    .map(toPublicMenuItem);
  return {
    slug: tenant.slug,
    name: profile?.name ?? tenant.slug,
    description: profile?.description ?? null,
    themeConfig: (tenant.themeConfig ?? {}) as Record<string, unknown>,
    contact: { phone: profile?.phone ?? null, email: profile?.email ?? null },
    address: {
      line1: profile?.addressLine1 ?? null,
      line2: profile?.addressLine2 ?? null,
      city: profile?.city ?? null,
      postalCode: profile?.postalCode ?? null,
      country: profile?.country ?? null,
    },
    hours: hours.map((hour) => ({
      weekday: hour.weekday,
      openTime: hour.openTime,
      closeTime: hour.closeTime,
      isClosed: hour.isClosed,
    })),
    menu: uncategorised.length > 0 ? [...menu, ...toUncategorised(uncategorised)] : menu,
    theme: tenant.theme,
    logoImageKey: profile?.logoImageKey ?? null,
  };
}

function toUncategorised(items: PublicMenuItem[]): PublicMenuCategory[] {
  if (items.length === 0) return [];
  return [{ id: "uncategorised", name: "Menu", description: null, items }];
}
