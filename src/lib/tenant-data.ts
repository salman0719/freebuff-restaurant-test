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
import { themeConfigSchema } from "../themes/config";
import { isUniqueViolation } from "./db-errors";
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
import { buildObjectKey, deleteObject, parseImageUpload, putObject } from "./storage";
import { processItemImage, processLogoImage } from "./storage-image";
import {
  categoryMoveSchema,
  createCategorySchema,
  createItemSchema,
  updateCategorySchema,
  updateItemSchema,
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
 * Create a menu item for the context tenant: validate input, prove the
 * target category (when set) belongs to the tenant — a forged `categoryId`
 * from another tenant yields `FORBIDDEN`, never a cross-tenant link —
 * then insert scoped to `ctx.tenant.id`. New items go last
 * (`max(sortOrder) + 1`); the server owns display order. `imageKey` is
 * accepted by the contract for Phase 3.6 uploads but no 3.5 form sends it.
 */
export async function createTenantItem(
  ctx: TenantContext,
  input: unknown
): Promise<ServiceResult<MenuItem>> {
  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid item.", validationFields(parsed.error));
  }
  if (parsed.data.categoryId != null) {
    const category = await getTenantCategory(ctx, parsed.data.categoryId);
    if (isErr(category)) return category;
  }
  const existing = await getTenantItems(ctx);
  if (isErr(existing)) return existing;
  const nextSort = existing.data.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const rows = await db
    .insert(menuItems)
    .values({
      tenantId: ctx.tenant.id,
      categoryId: parsed.data.categoryId ?? null,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      priceCents: parsed.data.priceCents,
      imageKey: parsed.data.imageKey ?? null,
      sortOrder: nextSort,
      isPublished: parsed.data.isPublished,
      isAvailable: parsed.data.isAvailable,
    })
    .returning();
  const created = rows[0];
  if (!created) {
    return err("INTERNAL", "Failed to create item.");
  }
  return ok(created);
}

/**
 * Update an item of the context tenant: validate input, prove the row
 * belongs to the tenant (forged ids yield `FORBIDDEN`), prove a new
 * `categoryId` (when set and non-null) belongs to the tenant too, then
 * save scoped by id AND tenant. `null` names are rejected — the database
 * requires one; `null` categoryId moves the item to uncategorised. An
 * empty update is a no-op returning the current row.
 */
export async function updateTenantItem(
  ctx: TenantContext,
  itemId: string,
  input: unknown
): Promise<ServiceResult<MenuItem>> {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid item.", validationFields(parsed.error));
  }
  if (parsed.data.name === null) {
    return err("VALIDATION_FAILED", "Invalid item.", {
      name: ["Item name is required."],
    });
  }
  const current = await getTenantItem(ctx, itemId);
  if (isErr(current)) return current;
  if (parsed.data.categoryId) {
    const category = await getTenantCategory(ctx, parsed.data.categoryId);
    if (isErr(category)) return category;
  }
  const set: Partial<MenuItem> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      (set as Record<string, unknown>)[key] = value;
    }
  }
  if (Object.keys(set).length === 0) {
    return ok(current.data);
  }
  const rows = await db
    .update(menuItems)
    .set(set)
    .where(and(eq(menuItems.id, current.data.id), eq(menuItems.tenantId, ctx.tenant.id)))
    .returning();
  const updated = rows[0];
  if (!updated) {
    return err("INTERNAL", "Failed to save item.");
  }
  return ok(updated);
}

/**
 * Delete an item of the context tenant: prove the row belongs to the
 * tenant (forged ids yield `FORBIDDEN`), then delete scoped by id AND
 * tenant. Items are leaves — nothing depends on them — so deletion is
 * immediate, with a two-step confirm in the UI against stray clicks.
 * A stored photo is removed too, so deletions never orphan files.
 */
export async function deleteTenantItem(
  ctx: TenantContext,
  itemId: string
): Promise<ServiceResult<MenuItem>> {
  const current = await getTenantItem(ctx, itemId);
  if (isErr(current)) return current;
  await db
    .delete(menuItems)
    .where(and(eq(menuItems.id, current.data.id), eq(menuItems.tenantId, ctx.tenant.id)));
  if (current.data.imageKey) {
    await deleteObject(current.data.imageKey).catch(() => undefined);
  }
  return ok(current.data);
}

/** Best-effort file cleanup: a failed delete must never fail the save. */
async function forgetObject(key: string | null): Promise<void> {
  if (key) {
    await deleteObject(key).catch(() => undefined);
  }
}

/**
 * Replace the logo of the context tenant from an upload: validate the
 * file (type, size, magic bytes), store it under a server-generated key,
 * then link it onto the profile scoped to `ctx.tenant.id`. The previous
 * logo is removed once the new one is linked, so replaces never orphan
 * files. Needs an existing profile — the name field is required for one,
 * so a logo-only upload with no profile reports the missing name instead
 * of uploading anything.
 */
export async function setTenantLogo(
  ctx: TenantContext,
  file: unknown
): Promise<ServiceResult<RestaurantProfile>> {
  const parsed = await parseImageUpload(file);
  if (isErr(parsed)) return parsed;
  const current = await getTenantProfile(ctx);
  if (isErr(current)) return current;
  if (!current.data) {
    return err("VALIDATION_FAILED", "Invalid profile.", {
      name: ["Restaurant name is required."],
    });
  }
  let image: { bytes: Uint8Array; extension: string };
  try {
    image = await processLogoImage(parsed.data.bytes);
  } catch {
    return err("INTERNAL", "Failed to save logo.");
  }
  const key = buildObjectKey("logos", ctx.tenant.id, image.extension);
  try {
    await putObject(key, image.bytes);
  } catch {
    // Storage down (or unwritable) must read as a failed save, never as a
    // crash: the action reports "profile saved, logo not" and the profile
    // row keeps no key for bytes that were never stored.
    await forgetObject(key);
    return err("INTERNAL", "Failed to save logo.");
  }
  const rows = await db
    .update(restaurantProfiles)
    .set({ logoImageKey: key })
    .where(eq(restaurantProfiles.tenantId, ctx.tenant.id))
    .returning();
  const updated = rows[0];
  if (!updated) {
    await forgetObject(key);
    return err("INTERNAL", "Failed to save logo.");
  }
  await forgetObject(current.data.logoImageKey);
  return ok(updated);
}

/**
 * Replace an item photo from an upload: validate the file, prove the item
 * belongs to the tenant (forged ids yield `FORBIDDEN`), store under a
 * server-generated key, then link it scoped by id AND tenant. The
 * previous photo is removed once the new one is linked.
 */
export async function setTenantItemImage(
  ctx: TenantContext,
  itemId: string,
  file: unknown
): Promise<ServiceResult<MenuItem>> {
  const parsed = await parseImageUpload(file);
  if (isErr(parsed)) return parsed;
  const current = await getTenantItem(ctx, itemId);
  if (isErr(current)) return current;
  let image: { bytes: Uint8Array; extension: string };
  try {
    image = await processItemImage(parsed.data.bytes);
  } catch {
    return err("INTERNAL", "Failed to save photo.");
  }
  const key = buildObjectKey("items", ctx.tenant.id, image.extension);
  try {
    await putObject(key, image.bytes);
  } catch {
    // Same contract as the logo path: a failed store is a failed save
    // with no link written, not a crash and not a half-linked row.
    await forgetObject(key);
    return err("INTERNAL", "Failed to save photo.");
  }
  const rows = await db
    .update(menuItems)
    .set({ imageKey: key })
    .where(and(eq(menuItems.id, current.data.id), eq(menuItems.tenantId, ctx.tenant.id)))
    .returning();
  const updated = rows[0];
  if (!updated) {
    await forgetObject(key);
    return err("INTERNAL", "Failed to save photo.");
  }
  await forgetObject(current.data.imageKey);
  return ok(updated);
}

/**
 * Remove an item photo: prove the item belongs to the tenant, clear the
 * link scoped by id AND tenant, then remove the file. Already-photoless
 * items are a no-op returning the current row.
 */
export async function clearTenantItemImage(
  ctx: TenantContext,
  itemId: string
): Promise<ServiceResult<MenuItem>> {
  const current = await getTenantItem(ctx, itemId);
  if (isErr(current)) return current;
  if (!current.data.imageKey) {
    return ok(current.data);
  }
  const rows = await db
    .update(menuItems)
    .set({ imageKey: null })
    .where(and(eq(menuItems.id, current.data.id), eq(menuItems.tenantId, ctx.tenant.id)))
    .returning();
  const updated = rows[0];
  if (!updated) {
    return err("INTERNAL", "Failed to remove photo.");
  }
  await forgetObject(current.data.imageKey);
  return ok(updated);
}

/**
 * Update theme/visibility for the context tenant: validate input, then save
 * scoped to `ctx.tenant.id`. There is deliberately no tenant-id parameter —
 * the context IS the authorisation. An empty update is a no-op returning
 * the current tenant.
 */
/**
 * Save per-tenant theme options for `themeId`: validate with that theme's
 * own schema (strict — a bad value is rejected, never silently reset), then
 * write scoped to `ctx.tenant.id`. The schema strips unknown keys, so stored
 * JSON only ever holds options the theme actually understands.
 */
export async function updateTenantThemeConfig(
  ctx: TenantContext,
  themeId: Tenant["theme"],
  input: unknown
): Promise<ServiceResult<Tenant>> {
  const parsed = themeConfigSchema(themeId).safeParse(input ?? {});
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid theme options.", validationFields(parsed.error));
  }
  const rows = await db
    .update(tenants)
    .set({ themeConfig: parsed.data as Record<string, unknown> })
    .where(eq(tenants.id, ctx.tenant.id))
    .returning();
  const updated = rows[0];
  if (!updated) {
    return err("INTERNAL", "Failed to save theme options.");
  }
  return ok({
    ...updated,
    theme: updated.theme as Tenant["theme"],
    themeConfig: (updated.themeConfig ?? {}) as Record<string, unknown>,
  });
}

export async function updateTenantSettings(
  ctx: TenantContext,
  input: unknown
): Promise<ServiceResult<Tenant>> {
  const parsed = updateTenantSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid settings.", validationFields(parsed.error));
  }
  const set: { theme?: Tenant["theme"]; published?: boolean } = {};
  if (parsed.data.theme !== undefined) set.theme = parsed.data.theme;
  if (parsed.data.published !== undefined) set.published = parsed.data.published;
  if (Object.keys(set).length === 0) {
    return ok(ctx.tenant);
  }
  const rows = await db.update(tenants).set(set).where(eq(tenants.id, ctx.tenant.id)).returning();
  const updated = rows[0];
  if (!updated) {
    return err("INTERNAL", "Failed to save settings.");
  }
  return ok({
    ...updated,
    theme: updated.theme as Tenant["theme"],
    themeConfig: (updated.themeConfig ?? {}) as Record<string, unknown>,
  });
}
