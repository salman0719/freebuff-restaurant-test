/**
 * Tenant-scoped data access (Phase 1.4). Server-only: imports the database.
 *
 * Every function takes an authorised `TenantContext` (see
 * `./tenant-context.ts`) — never a tenant id, never a user id. Tenant
 * isolation is structural: there is no parameter through which a caller
 * could smuggle another tenant's id, and every `WHERE` clause pins
 * `tenant_id` to the context. Single-record getters additionally verify
 * the row belongs to the context tenant, so a forged child id from another
 * tenant yields `FORBIDDEN`, never the row.
 *
 * Reads return `ok(...)` (only the database throwing escapes, per the
 * `ServiceResult` contract — unexpected crashes throw). The single mutation
 * here, `updateTenantSettings`, establishes the validate → scope → save
 * pattern Phase 3 extends to profiles, hours, categories, and items.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import {
  menuCategories,
  menuItems,
  openingHours,
  restaurantProfiles,
  tenants,
} from "../../db/schema";
import { err, isErr, ok, type ServiceResult } from "./result";
import type {
  MenuCategory,
  MenuItem,
  OpeningHoursRow,
  OwnerRestaurant,
  RestaurantProfile,
  Tenant,
} from "./restaurant";
import type { TenantContext } from "./tenant-context";
import { updateProfileSchema, updateTenantSchema, validationFields } from "./validation";

const uuidSchema = z.string().uuid();

function forbidden<T>(): ServiceResult<T> {
  return err("FORBIDDEN", "You do not have access to this restaurant.");
}

/** Structural guard: a child row belongs to the authorised tenant. */
export function ownsRow(ctx: TenantContext, row: { tenantId: string }): boolean {
  return row.tenantId === ctx.tenant.id;
}

export async function getTenantProfile(
  ctx: TenantContext
): Promise<ServiceResult<RestaurantProfile | null>> {
  const rows = await db
    .select()
    .from(restaurantProfiles)
    .where(eq(restaurantProfiles.tenantId, ctx.tenant.id))
    .limit(1);
  return ok(rows[0] ?? null);
}

export async function getTenantHours(
  ctx: TenantContext
): Promise<ServiceResult<OpeningHoursRow[]>> {
  const rows = await db
    .select()
    .from(openingHours)
    .where(eq(openingHours.tenantId, ctx.tenant.id))
    .orderBy(openingHours.weekday);
  return ok(rows);
}

export async function getTenantCategories(
  ctx: TenantContext
): Promise<ServiceResult<MenuCategory[]>> {
  const rows = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.tenantId, ctx.tenant.id))
    .orderBy(menuCategories.sortOrder);
  return ok(rows);
}

export async function getTenantItems(
  ctx: TenantContext,
  categoryId?: string | null
): Promise<ServiceResult<MenuItem[]>> {
  if (categoryId != null) {
    const category = await getTenantCategory(ctx, categoryId);
    if (isErr(category)) return category;
  }
  const rows = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.tenantId, ctx.tenant.id))
    .orderBy(menuItems.sortOrder);
  const items = categoryId == null ? rows : rows.filter((item) => item.categoryId === categoryId);
  return ok(items);
}

export async function getTenantCategory(
  ctx: TenantContext,
  categoryId: string
): Promise<ServiceResult<MenuCategory>> {
  if (!uuidSchema.safeParse(categoryId).success) {
    return forbidden();
  }
  const rows = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.id, categoryId))
    .limit(1);
  const row = rows[0];
  if (!row || !ownsRow(ctx, row)) {
    return forbidden();
  }
  return ok(row);
}

export async function getTenantItem(
  ctx: TenantContext,
  itemId: string
): Promise<ServiceResult<MenuItem>> {
  if (!uuidSchema.safeParse(itemId).success) {
    return forbidden();
  }
  const rows = await db.select().from(menuItems).where(eq(menuItems.id, itemId)).limit(1);
  const row = rows[0];
  if (!row || !ownsRow(ctx, row)) {
    return forbidden();
  }
  return ok(row);
}

/** Pure assembly of the owner view from already-scoped rows. */
export function assembleOwnerRestaurant(
  ctx: TenantContext,
  profile: RestaurantProfile | null,
  hours: OpeningHoursRow[],
  categories: MenuCategory[],
  items: MenuItem[]
): OwnerRestaurant {
  return {
    tenant: ctx.tenant,
    profile,
    hours,
    categories,
    items,
    membershipRole: ctx.membership.role,
  };
}

/** Full private picture for the dashboard. Only callable with a context. */
export async function getOwnerRestaurant(
  ctx: TenantContext
): Promise<ServiceResult<OwnerRestaurant>> {
  const [profile, hours, categories, items] = await Promise.all([
    getTenantProfile(ctx),
    getTenantHours(ctx),
    getTenantCategories(ctx),
    getTenantItems(ctx),
  ]);
  if (isErr(profile)) return profile;
  if (isErr(hours)) return hours;
  if (isErr(categories)) return categories;
  if (isErr(items)) return items;
  return ok(assembleOwnerRestaurant(ctx, profile.data, hours.data, categories.data, items.data));
}

/**
 * Create or update the restaurant profile for the context tenant:
 * validate input, then save scoped to `ctx.tenant.id`. There is
 * deliberately no tenant-id parameter — the context IS the
 * authorisation. Semantics per field: `undefined` keeps the stored
 * value, `null` clears it — except `name`, which the database requires:
 * `null` is rejected and a missing profile needs a name, otherwise the
 * insert could never succeed. An empty update is a no-op returning the
 * current profile (or null when none exists yet).
 */
export async function updateTenantProfile(
  ctx: TenantContext,
  input: unknown
): Promise<ServiceResult<RestaurantProfile | null>> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid profile.", validationFields(parsed.error));
  }
  const current = await getTenantProfile(ctx);
  if (isErr(current)) return current;
  if (parsed.data.name === null || (parsed.data.name === undefined && !current.data)) {
    return err("VALIDATION_FAILED", "Invalid profile.", {
      name: ["Restaurant name is required."],
    });
  }
  const set: Partial<RestaurantProfile> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      (set as Record<string, unknown>)[key] = value;
    }
  }
  if (Object.keys(set).length === 0) {
    return ok(current.data);
  }
  if (!current.data) {
    const rows = await db
      .insert(restaurantProfiles)
      .values({ tenantId: ctx.tenant.id, ...set } as typeof restaurantProfiles.$inferInsert)
      .returning();
    const created = rows[0];
    if (!created) {
      return err("INTERNAL", "Failed to save profile.");
    }
    return ok(created);
  }
  const rows = await db
    .update(restaurantProfiles)
    .set(set)
    .where(eq(restaurantProfiles.tenantId, ctx.tenant.id))
    .returning();
  const updated = rows[0];
  if (!updated) {
    return err("INTERNAL", "Failed to save profile.");
  }
  return ok(updated);
}

/**
 * Update theme/visibility for the context tenant: validate input, then save
 * scoped to `ctx.tenant.id`. There is deliberately no tenant-id parameter —
 * the context IS the authorisation. An empty update is a no-op returning
 * the current tenant.
 */
export async function updateTenantSettings(
  ctx: TenantContext,
  input: unknown
): Promise<ServiceResult<Tenant>> {
  const parsed = updateTenantSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid settings.", validationFields(parsed.error));
  }
  const set: { theme?: Tenant["theme"]; published?: boolean; customDomain?: string | null } = {};
  if (parsed.data.theme !== undefined) set.theme = parsed.data.theme;
  if (parsed.data.published !== undefined) set.published = parsed.data.published;
  if (parsed.data.customDomain !== undefined) set.customDomain = parsed.data.customDomain;
  if (Object.keys(set).length === 0) {
    return ok(ctx.tenant);
  }
  const rows = await db.update(tenants).set(set).where(eq(tenants.id, ctx.tenant.id)).returning();
  const updated = rows[0];
  if (!updated) {
    return err("INTERNAL", "Failed to save settings.");
  }
  return ok({ ...updated, theme: updated.theme as Tenant["theme"] });
}
