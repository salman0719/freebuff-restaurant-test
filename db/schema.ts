/**
 * MVP database schema (Phase 1.1).
 *
 * Sources: `docs/decisions/0002-open-decisions.md` §1 (Drizzle + versioned
 * migrations, one shared DB with `tenant_id` FKs), `0003-tenant-identification.md`
 * (tenants/memberships model), `docs/product-scope.md` (no reservations /
 * ordering concepts in the MVP).
 *
 * Conventions used throughout:
 * - `id` is a server-generated uuid, internal only (never a client authority
 *   claim — see 0003).
 * - Every tenant-owned row carries `tenant_id` with `ON DELETE CASCADE`,
 *   so deleting a tenant removes its content but nothing else.
 * - `created_at` / `updated_at` on every table.
 * - Money uses integer `price_cents` (never float).
 * - Images store a provider-neutral R2 object key (see 0002 §5), never a
 *   provider URL.
 *
 * Deliberately deferred (owned by later phases, do NOT add speculatively):
 * - `users` / sessions tables (Phase 1.3 auth integration owns the
 *   Auth.js adapter tables; `memberships.user_id` is plain text until then).
 * - Reservations, ordering, payments (post-MVP per product scope).
 * - Special/holiday hours, i18n, analytics (out of scope).
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/** Public themes agreed for the MVP (product-scope sign-off). */
export const THEME_IDS = ["cafe", "takeaway"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Membership roles. Platform operators may also appear here when they are explicitly attached to a tenant. */
export const MEMBERSHIP_ROLES = ["owner", "operator"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  };
}

/**
 * Tenants (0003). `slug` is the human URL-safe identifier (effectively
 * immutable — renames break URLs); `custom_domain` is nullable and unique
 * (custom-domain onboarding itself is deferred, the column reserves the
 * mapping). `published` gates the whole public site.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    customDomain: text("custom_domain"),
    published: boolean("published").notNull().default(false),
    theme: text("theme").notNull().default("cafe"),
    ...timestamps(),
  },
  (t) => [
    unique("tenants_slug_unique").on(t.slug),
    unique("tenants_custom_domain_unique").on(t.customDomain),
    // URL-safe slug: lowercase alphanumerics joined with single hyphens.
    // Reserved subdomains (www, api, app, admin) and duplicate detection
    // are enforced at creation time in the app layer (Phase 1.2/1.4).
    check("tenants_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("tenants_theme_allowed", sql`${t.theme} in ('cafe', 'takeaway')`),
  ]
);

/**
 * Memberships (0003). Ownership of a tenant is proven ONLY by a row here —
 * a global `owner` role never implies access to a specific tenant.
 *
 * `userId` is intentionally plain text (no FK): the `users` table arrives
 * with the Phase 1.3 Auth.js integration, which owns the adapter schema.
 * Do not invent a competing `users` table here.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("owner"),
    ...timestamps(),
  },
  (t) => [
    unique("memberships_user_tenant_unique").on(t.userId, t.tenantId),
    index("memberships_tenant_idx").on(t.tenantId),
    index("memberships_user_idx").on(t.userId),
    check("memberships_role_allowed", sql`${t.role} in ('owner', 'operator')`),
  ]
);

/** One restaurant profile per tenant: public name, contact, and location. */
export const restaurantProfiles = pgTable(
  "restaurant_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    phone: text("phone"),
    email: text("email"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    /** Provider-neutral R2 object key for the logo (see 0002 §5). */
    logoImageKey: text("logo_image_key"),
    ...timestamps(),
  },
  (t) => [unique("restaurant_profiles_tenant_unique").on(t.tenantId)]
);

/**
 * Opening hours: at most one row per tenant per weekday (0 = Sunday).
 * Special/holiday hours are out of scope — no extra tables for them.
 * Times are nullable so a row can represent "closed" via `isClosed`
 * without overloading midnight values. Overnight ranges (e.g. 18:00–02:00)
 * are legal, so no `open < close` check is enforced here.
 */
export const openingHours = pgTable(
  "opening_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    openTime: time("open_time"),
    closeTime: time("close_time"),
    isClosed: boolean("is_closed").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    unique("opening_hours_tenant_weekday_unique").on(t.tenantId, t.weekday),
    index("opening_hours_tenant_idx").on(t.tenantId),
    check("opening_hours_weekday_range", sql`${t.weekday} between 0 and 6`),
  ]
);

/** Menu categories, ordered per tenant. Visibility via `isPublished`. */
export const menuCategories = pgTable(
  "menu_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    unique("menu_categories_tenant_name_unique").on(t.tenantId, t.name),
    index("menu_categories_tenant_idx").on(t.tenantId),
    index("menu_categories_tenant_sort_idx").on(t.tenantId, t.sortOrder),
  ]
);

/**
 * Menu items. `tenantId` is denormalised on every row (0003: `tenant_id`
 * FKs everywhere) so scoping never depends on joining the category.
 * Deleting a category keeps its items as uncategorised (`SET NULL`)
 * instead of silently deleting sellable data.
 */
export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => menuCategories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    /** Provider-neutral R2 object key for the item photo (see 0002 §5). */
    imageKey: text("image_key"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    isAvailable: boolean("is_available").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    index("menu_items_tenant_idx").on(t.tenantId),
    index("menu_items_category_idx").on(t.categoryId),
    index("menu_items_category_sort_idx").on(t.categoryId, t.sortOrder),
    check("menu_items_price_non_negative", sql`${t.priceCents} >= 0`),
  ]
);

export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  memberships: many(memberships),
  profile: one(restaurantProfiles),
  hours: many(openingHours),
  categories: many(menuCategories),
  items: many(menuItems),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  tenant: one(tenants, {
    fields: [memberships.tenantId],
    references: [tenants.id],
  }),
}));

export const restaurantProfilesRelations = relations(restaurantProfiles, ({ one }) => ({
  tenant: one(tenants, {
    fields: [restaurantProfiles.tenantId],
    references: [tenants.id],
  }),
}));

export const openingHoursRelations = relations(openingHours, ({ one }) => ({
  tenant: one(tenants, {
    fields: [openingHours.tenantId],
    references: [tenants.id],
  }),
}));

export const menuCategoriesRelations = relations(menuCategories, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [menuCategories.tenantId],
    references: [tenants.id],
  }),
  items: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [menuItems.tenantId],
    references: [tenants.id],
  }),
  category: one(menuCategories, {
    fields: [menuItems.categoryId],
    references: [menuCategories.id],
  }),
}));
