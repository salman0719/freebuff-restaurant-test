/**
 * Public restaurant data service (Phase 2.1). Server-only: imports the database.
 *
 * Builds the published-only `PublicRestaurant` view for visitor pages. No
 * session required — publication IS the authorisation: a tenant with
 * `published = false`, an unknown slug, and a malformed slug all resolve to
 * the same `NOT_FOUND`, so the public surface never oracles existence or
 * draft state.
 *
 * Visibility rules (reversible; 2.7 integration may refine):
 * - Tenant must be `published`; profile is optional (nameless sites render
 *   with the slug-derived fallback — actually no: without a profile there
 *   is no public name, so the site still renders with empty contact/menu
 *   sections rather than 404ing; only the tenant gate 404s).
 * - Categories need `is_published`; items need `is_published AND
 *   is_available`. Categories left with no visible items are dropped, so
 *   visitors never see empty headings.
 * - Internal ids appear only as opaque list keys (`PublicMenuItem.id`,
 *   `PublicMenuCategory.id`); no user, membership, or config data leaves
 *   this module.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  menuCategories,
  menuItems,
  openingHours,
  restaurantProfiles,
  tenants,
} from "../../db/schema";
import { err, ok, type ServiceResult } from "./result";
import type { PublicMenuCategory, PublicMenuItem, PublicRestaurant, ThemeId } from "./restaurant";
import { slugSchema } from "./validation";

type TenantRow = typeof tenants.$inferSelect;
type ProfileRow = typeof restaurantProfiles.$inferSelect;
type HoursRow = typeof openingHours.$inferSelect;
type CategoryRow = typeof menuCategories.$inferSelect;
type ItemRow = typeof menuItems.$inferSelect;

export interface PublicRestaurantRows {
  tenant: TenantRow;
  profile: ProfileRow | null;
  hours: HoursRow[];
  categories: CategoryRow[];
  items: ItemRow[];
}

export function toPublicMenuItem(row: ItemRow): PublicMenuItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    imageKey: row.imageKey,
  };
}

/** Pure assembly: published + available only, empty categories dropped. */
export function toPublicRestaurant(rows: PublicRestaurantRows): PublicRestaurant {
  const { tenant, profile, hours, categories, items } = rows;
  const visibleItems = items.filter((item) => item.isPublished && item.isAvailable);
  const menu: PublicMenuCategory[] = categories
    .filter((category) => category.isPublished)
    .map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      items: visibleItems.filter((item) => item.categoryId === category.id).map(toPublicMenuItem),
    }))
    .filter((category) => category.items.length > 0);
  const uncategorised = visibleItems
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
    theme: tenant.theme as ThemeId,
    logoImageKey: profile?.logoImageKey ?? null,
  };
}

function toUncategorised(items: PublicMenuItem[]): PublicMenuCategory[] {
  if (items.length === 0) return [];
  return [{ id: "uncategorised", name: "Menu", description: null, items }];
}

function notFound(): ServiceResult<PublicRestaurant> {
  return err("NOT_FOUND", "Restaurant not found.");
}

async function findPublishedTenant(slug: string): Promise<TenantRow | null> {
  const rows = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.published, true)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Load the public view for `slug`. Unknown, unpublished, and malformed
 * slugs all yield `NOT_FOUND` — never a draft, never a distinction.
 */
export async function getPublicRestaurant(slug: string): Promise<ServiceResult<PublicRestaurant>> {
  if (!slugSchema.safeParse(slug).success) {
    return notFound();
  }
  const tenant = await findPublishedTenant(slug);
  if (!tenant) {
    return notFound();
  }
  const [profileRows, hourRows, categoryRows, itemRows] = await Promise.all([
    db.select().from(restaurantProfiles).where(eq(restaurantProfiles.tenantId, tenant.id)).limit(1),
    db.select().from(openingHours).where(eq(openingHours.tenantId, tenant.id)),
    db.select().from(menuCategories).where(eq(menuCategories.tenantId, tenant.id)),
    db.select().from(menuItems).where(eq(menuItems.tenantId, tenant.id)),
  ]);
  return ok(
    toPublicRestaurant({
      tenant,
      profile: profileRows[0] ?? null,
      hours: hourRows,
      categories: categoryRows,
      items: itemRows,
    })
  );
}
