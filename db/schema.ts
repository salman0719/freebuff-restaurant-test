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
 * - `created_at` / `updated_at` on every table — except the append-only
 *   `audit_events`, which carries only `created_at` (see its own note).
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
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export { AUDIT_ACTIONS, MEMBERSHIP_ROLES, SLUG_PATTERN, THEME_IDS } from "./constants";
export type { AuditAction, MembershipRole, ThemeId } from "./constants";

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
    /**
     * Per-tenant theme options (Phase 2.3). Validated at write time and
     * defensively at render by the owning theme's Zod schema (see
     * `src/themes/config.ts`); the database stores JSON as-is so new
     * options never need a migration — only a schema default.
     */
    themeConfig: jsonb("theme_config").notNull().default({}),
    ...timestamps(),
  },
  (t) => [
    unique("tenants_slug_unique").on(t.slug),
    unique("tenants_custom_domain_unique").on(t.customDomain),
    // URL-safe slug: lowercase alphanumerics joined with single hyphens.
    // Reserved subdomains (www, api, app, admin) and duplicate detection
    // are enforced at creation time in the app layer (Phase 1.2/1.4).
    check("tenants_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    // `diner` + `garden` widened together in ONE migration (0004: two new
    // themes, one migration). The CHECK ran ahead of the app on purpose:
    // `garden` entered THEME_IDS only when its component shipped, so the
    // database accepted the id before the app did, and no second migration
    // was needed. Keep this list a superset of THEME_IDS.
    check(
      "tenants_theme_allowed",
      sql`${t.theme} in ('cafe', 'takeaway', 'bistro', 'diner', 'garden')`
    ),
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

/**
 * Auth.js adapter tables (Phase 1.3 owns this schema; owned by
 * `@auth/drizzle-adapter`, not invented here).
 *
 * JS property names stay adapter-compatible (`userId`, `emailVerified`,
 * `sessionToken`, …); DB columns use this project's snake_case. Table
 * names are plural to match the MVP tables; they are passed explicitly to
 * `DrizzleAdapter({ usersTable, accountsTable, … })` in `src/auth.ts`.
 *
 * `users.role` is the GLOBAL platform role (default `owner`): it decides
 * operator-only access but NEVER access to a specific tenant — only a
 * `memberships` row proves that (see 0003). `memberships.user_id` stays
 * FK-less text matched by equality with `users.id` (adapter ids are
 * UUID-shaped text), so no backfill or FK change is needed.
 *
 * Adapter tables carry no `created_at`/`updated_at` except `users`: extra
 * columns are harmless (defaults fill them) but the adapter surface stays
 * canonical everywhere else.
 */
export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: timestamp("email_verified", { mode: "date" }),
    image: text("image"),
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("users_role_allowed", sql`${t.role} in ('owner', 'operator')`)]
);

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("accounts_user_idx").on(t.userId),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
);

/**
 * Operator audit trail (Phase 4.4). Append-only and deliberately unlike
 * every other table here:
 *
 * - **No `updated_at`.** A record of what happened is not edited; the
 *   missing column is the enforcement, since there is nothing to update it
 *   with. Every other table in this file carries both timestamps.
 * - **It survives what it describes.** `tenant_id` is `SET NULL` and
 *   `actor_user_id` carries no FK at all, so deleting a restaurant or an
 *   account cannot delete the fact that someone created it. Every
 *   tenant-owned table above cascades instead, because for content the
 *   cascade IS the correct behaviour.
 * - **It snapshots names.** `tenant_slug` and `actor_email` are copied at
 *   write time, so the trail still reads after a slug is retired or an
 *   address changes. The email is read from the account row, never from a
 *   request — a caller cannot sign a wrong name into the history.
 * - **It stores no content.** `detail` holds the few facts an action
 *   changed (a theme, a publishing flag, an invited address), never a
 *   restaurant's menu, hours, or contact details. An operator needs to know
 *   who did what, not to read the owner's drafts — the same line
 *   `operator-tenants.ts` draws for its reads.
 *
 * `tenant_id` is nullable because a future platform-wide act (granting the
 * staff role itself, say) has no restaurant as its subject.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    /** The staff account that acted. No FK: the trail outlives accounts. */
    actorUserId: text("actor_user_id").notNull(),
    /** Snapshot of the actor's address at the time of the act. */
    actorEmail: text("actor_email"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    /** Snapshot of the restaurant's address at the time of the act. */
    tenantSlug: text("tenant_slug"),
    detail: jsonb("detail").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The console reads one restaurant's history newest first.
    index("audit_events_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("audit_events_actor_idx").on(t.actorUserId),
    check(
      "audit_events_action_allowed",
      sql`${t.action} in ('tenant.created', 'tenant.owner_granted')`
    ),
  ]
);

export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  memberships: many(memberships),
  profile: one(restaurantProfiles),
  hours: many(openingHours),
  categories: many(menuCategories),
  items: many(menuItems),
  auditEvents: many(auditEvents),
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

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditEvents.tenantId],
    references: [tenants.id],
  }),
}));
