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
 * `ServiceResult` contract — unexpected crashes throw). Mutations follow
 * validate → scope → save: profile, hours, and category mutations all
 * take a context plus untrusted input, never ids they could smuggle.
 */
import { and, eq } from "drizzle-orm";
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
import {
  categoryMoveSchema,
  createCategorySchema,
  updateCategorySchema,
  updateHoursSchema,
  updateProfileSchema,
  updateTenantSchema,
  validationFields,
} from "./validation";

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
    // Name tiebreak keeps display order deterministic when rows share a
    // `sortOrder` (e.g. seed data); `moveTenantCategory` renumbers by
    // index so ties never block reordering.
    .orderBy(menuCategories.sortOrder, menuCategories.name);
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
 * Replace the full opening-hours week for the context tenant: validate all
 * seven days, then upsert each weekday scoped to `ctx.tenant.id`. Full-week
 * replacement keeps the public `HoursList` consistent — it renders exactly
 * the stored rows, so partial saves could leave days silently missing.
 * Times follow `openingHoursSchema`: closed days carry no times, open days
 * need both, overnight ranges (18:00–02:00) are legal. Returns the week
 * ordered Sunday-first.
 */
export async function updateTenantHours(
  ctx: TenantContext,
  input: unknown
): Promise<ServiceResult<OpeningHoursRow[]>> {
  const parsed = updateHoursSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid opening hours.", validationFields(parsed.error));
  }
  for (const day of parsed.data) {
    await db
      .insert(openingHours)
      .values({
        tenantId: ctx.tenant.id,
        weekday: day.weekday,
        openTime: day.openTime ?? null,
        closeTime: day.closeTime ?? null,
        isClosed: day.isClosed,
      })
      .onConflictDoUpdate({
        target: [openingHours.tenantId, openingHours.weekday],
        set: {
          openTime: day.openTime ?? null,
          closeTime: day.closeTime ?? null,
          isClosed: day.isClosed,
        },
      });
  }
  const saved = await getTenantHours(ctx);
  if (isErr(saved)) return saved;
  return ok(saved.data);
}

/** Postgres unique-violation code — maps a lost name race to a field error. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

function duplicateName<T>(): ServiceResult<T> {
  return err("VALIDATION_FAILED", "Invalid category.", {
    name: ["A category with this name already exists."],
  });
}

/**
 * Create a menu category for the context tenant: validate input, reject a
 * duplicate name within the tenant, then insert scoped to
 * `ctx.tenant.id`. New categories go last (`max(sortOrder) + 1`) — the
 * server owns display order, so any client-sent `sortOrder` is ignored.
 * A lost insert race on the `(tenant_id, name)` unique index maps to the
 * same friendly field error instead of leaking a database crash.
 */
export async function createTenantCategory(
  ctx: TenantContext,
  input: unknown
): Promise<ServiceResult<MenuCategory>> {
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid category.", validationFields(parsed.error));
  }
  const existing = await getTenantCategories(ctx);
  if (isErr(existing)) return existing;
  if (existing.data.some((row) => row.name === parsed.data.name)) {
    return duplicateName();
  }
  const nextSort = existing.data.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  try {
    const rows = await db
      .insert(menuCategories)
      .values({
        tenantId: ctx.tenant.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        sortOrder: nextSort,
        isPublished: parsed.data.isPublished,
      })
      .returning();
    const created = rows[0];
    if (!created) {
      return err("INTERNAL", "Failed to create category.");
    }
    return ok(created);
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateName();
    throw error;
  }
}

/**
 * Update a category of the context tenant: validate input, prove the row
 * belongs to the tenant (forged ids yield `FORBIDDEN`), reject a rename
 * onto a sibling's name, then save scoped by id AND tenant. `null` names
 * are rejected — the database requires one. An empty update is a no-op
 * returning the current row.
 */
export async function updateTenantCategory(
  ctx: TenantContext,
  categoryId: string,
  input: unknown
): Promise<ServiceResult<MenuCategory>> {
  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid category.", validationFields(parsed.error));
  }
  if (parsed.data.name === null) {
    return err("VALIDATION_FAILED", "Invalid category.", {
      name: ["Category name is required."],
    });
  }
  const current = await getTenantCategory(ctx, categoryId);
  if (isErr(current)) return current;
  if (parsed.data.name !== undefined && parsed.data.name !== current.data.name) {
    const siblings = await getTenantCategories(ctx);
    if (isErr(siblings)) return siblings;
    if (siblings.data.some((row) => row.id !== current.data.id && row.name === parsed.data.name)) {
      return duplicateName();
    }
  }
  const set: Partial<MenuCategory> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      (set as Record<string, unknown>)[key] = value;
    }
  }
  if (Object.keys(set).length === 0) {
    return ok(current.data);
  }
  try {
    const rows = await db
      .update(menuCategories)
      .set(set)
      .where(
        and(eq(menuCategories.id, current.data.id), eq(menuCategories.tenantId, ctx.tenant.id))
      )
      .returning();
    const updated = rows[0];
    if (!updated) {
      return err("INTERNAL", "Failed to save category.");
    }
    return ok(updated);
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateName();
    throw error;
  }
}

/** A deleted category plus the items it left behind as uncategorised. */
export interface DeleteCategoryResult {
  category: MenuCategory;
  /** Items kept in the tenant with `categoryId` cleared (FK `SET NULL`). */
  uncategorisedCount: number;
}

/**
 * Delete a category of the context tenant: prove the row belongs to the
 * tenant (forged ids yield `FORBIDDEN`), then delete scoped by id AND
 * tenant. Member items are NOT deleted — the foreign key clears them to
 * uncategorised, and the returned count lets the UI say so honestly.
 */
export async function deleteTenantCategory(
  ctx: TenantContext,
  categoryId: string
): Promise<ServiceResult<DeleteCategoryResult>> {
  const current = await getTenantCategory(ctx, categoryId);
  if (isErr(current)) return current;
  const items = await getTenantItems(ctx, current.data.id);
  if (isErr(items)) return items;
  await db
    .delete(menuCategories)
    .where(and(eq(menuCategories.id, current.data.id), eq(menuCategories.tenantId, ctx.tenant.id)));
  return ok({ category: current.data, uncategorisedCount: items.data.length });
}

/**
 * Move a category of the context tenant one step up or down the display
 * order: prove the row belongs to the tenant, then renumber the whole
 * list by index with the row relocated. Renumbering (instead of swapping
 * two `sortOrder` values) keeps moves working when rows share a value.
 * Moving past either end is a no-op returning the current order.
 */
export async function moveTenantCategory(
  ctx: TenantContext,
  categoryId: string,
  input: unknown
): Promise<ServiceResult<MenuCategory[]>> {
  const parsed = categoryMoveSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid move.", validationFields(parsed.error));
  }
  const current = await getTenantCategory(ctx, categoryId);
  if (isErr(current)) return current;
  const list = await getTenantCategories(ctx);
  if (isErr(list)) return list;
  const ordered = list.data.map((row) => row.id);
  const from = ordered.indexOf(current.data.id);
  const to = parsed.data.direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ordered.length) {
    return ok(list.data);
  }
  ordered.splice(to, 0, ...ordered.splice(from, 1));
  for (const [index, id] of ordered.entries()) {
    await db
      .update(menuCategories)
      .set({ sortOrder: index })
      .where(and(eq(menuCategories.id, id), eq(menuCategories.tenantId, ctx.tenant.id)));
  }
  const saved = await getTenantCategories(ctx);
  if (isErr(saved)) return saved;
  return ok(saved.data);
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
