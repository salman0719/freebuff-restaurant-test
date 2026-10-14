/**
 * Operator-facing tenant reads (Phase 4.2, extended in 4.3). Server-only:
 * imports the database.
 *
 * Reading across tenants needs the same explicit authorisation as writing
 * across them, and for the same reason: nothing here is scoped by a
 * `TenantContext`, so the staff check cannot be inherited from a caller's
 * context — it is re-checked at every entry point, and a caller that skipped
 * `requireOperator` gets `FORBIDDEN` rather than rows.
 *
 * These reads hand back setup FACTS and never tenant content: which theme a
 * restaurant chose, whether anything on its menu is visible, whether a week
 * of hours is entered, how many people can open it — never the menu itself,
 * the values behind those hours, or the contact details. The hours rows are
 * loaded only because "a week is entered" is a predicate over them, and
 * nothing but that judgement reaches a page. An operator needs to know
 * whether a restaurant is ready, not to read its unpublished drafts; wider
 * staff access is a Phase 4.4 decision, not something this module settles by
 * accident.
 *
 * Scope note: the console loads every tenant's facts in one pass per table
 * rather than one query per tenant. That is the right shape for an operator
 * console at pilot scale, where the tenant list is short and an operator
 * scans all of it. If the list ever grows past a screenful, this becomes a
 * paginated or per-tenant read rather than a wider query.
 */
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import type { ThemeId } from "../../db/constants";
import {
  memberships,
  menuCategories,
  menuItems,
  openingHours,
  restaurantProfiles,
  tenants,
} from "../../db/schema";
import { getThemeDefinition } from "../themes/registry";
import { getOnboardingSteps, summariseOnboarding } from "./onboarding";
import type { OnboardingStep, OnboardingSummary } from "./onboarding";
import type { AuthenticatedUser } from "./permissions";
import { err, ok, type ServiceResult } from "./result";

function notStaff<T>(): ServiceResult<T> {
  return err("FORBIDDEN", "Operator access required.");
}

/** A tenant as the operator console lists it. */
export interface OperatorTenantSummary {
  id: string;
  slug: string;
  /** Profile name, falling back to the slug so a nameless tenant still reads. */
  name: string;
  theme: ThemeId;
  themeLabel: string;
  published: boolean;
  customDomain: string | null;
}

/** The raw row the summary is built from, so the mapping stays testable. */
export interface OperatorTenantRow {
  id: string;
  slug: string;
  theme: string;
  published: boolean;
  customDomain: string | null;
  profileName: string | null;
}

/**
 * Pure mapping from a stored row to the console's view. An unknown theme id
 * (a value that predates a retired theme) resolves through the registry
 * fallback rather than throwing, exactly as the public page does.
 */
export function toOperatorTenantSummary(row: OperatorTenantRow): OperatorTenantSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.profileName?.trim() ? row.profileName : row.slug,
    theme: row.theme as ThemeId,
    themeLabel: getThemeDefinition(row.theme as ThemeId).label,
    published: row.published,
    customDomain: row.customDomain,
  };
}

/** One tenant plus the facts its onboarding checklist is computed from. */
export interface TenantSetupFacts {
  summary: OperatorTenantRow;
  profile: { name: string | null } | null;
  categories: { id: string; isPublished: boolean }[];
  /** VISIBLE items only (published and available) — enough to judge the menu. */
  items: { categoryId: string | null; isPublished: boolean; isAvailable: boolean }[];
  hours: { openTime: string | null; isClosed: boolean }[];
  ownerCount: number;
}

/** A tenant and its setup status, as the console renders it. */
export interface OperatorTenantSetup extends OperatorTenantSummary {
  steps: OnboardingStep[];
  summary: OnboardingSummary;
}

/** Pure: facts in, checklist out. The rules live in `./onboarding`. */
export function toTenantSetup(facts: TenantSetupFacts): OperatorTenantSetup {
  const summary = toOperatorTenantSummary(facts.summary);
  const steps = getOnboardingSteps({
    theme: summary.theme,
    themeLabel: summary.themeLabel,
    published: summary.published,
    customDomain: summary.customDomain,
    profile: facts.profile,
    menu: { categories: facts.categories, items: facts.items },
    hours: facts.hours,
    ownerCount: facts.ownerCount,
  });
  return { ...summary, steps, summary: summariseOnboarding(steps) };
}

/**
 * Loads the facts for every tenant, or one when a slug is given. Injected so
 * the checklist and the authorisation are unit-tested without a database.
 */
export type TenantSetupFinder = (slug?: string) => Promise<TenantSetupFacts[]>;

async function findSetupFacts(slug?: string): Promise<TenantSetupFacts[]> {
  const tenantRows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      theme: tenants.theme,
      published: tenants.published,
      customDomain: tenants.customDomain,
      profileName: restaurantProfiles.name,
    })
    .from(tenants)
    .leftJoin(restaurantProfiles, eq(restaurantProfiles.tenantId, tenants.id))
    .where(slug === undefined ? undefined : eq(tenants.slug, slug))
    // Newest first: a restaurant an operator has just created is the one they
    // are most likely to be looking for.
    .orderBy(desc(tenants.createdAt));
  if (tenantRows.length === 0) {
    return [];
  }

  // Only visible items are fetched — the two flags are filtered in SQL, so the
  // row count is bounded by the published menu rather than the whole table.
  const itemRows = await db
    .select({
      tenantId: menuItems.tenantId,
      categoryId: menuItems.categoryId,
      isPublished: menuItems.isPublished,
      isAvailable: menuItems.isAvailable,
    })
    .from(menuItems)
    .where(and(eq(menuItems.isPublished, true), eq(menuItems.isAvailable, true)));
  const categoryRows = await db
    .select({
      tenantId: menuCategories.tenantId,
      id: menuCategories.id,
      isPublished: menuCategories.isPublished,
    })
    .from(menuCategories);
  const hourRows = await db
    .select({
      tenantId: openingHours.tenantId,
      openTime: openingHours.openTime,
      isClosed: openingHours.isClosed,
    })
    .from(openingHours);
  const membershipRows = await db
    .select({ tenantId: memberships.tenantId, people: count() })
    .from(memberships)
    .groupBy(memberships.tenantId);

  return tenantRows.map((summary) => ({
    summary,
    profile: summary.profileName === null ? null : { name: summary.profileName },
    categories: categoryRows
      .filter((row) => row.tenantId === summary.id)
      .map((row) => ({ id: row.id, isPublished: row.isPublished })),
    items: itemRows
      .filter((row) => row.tenantId === summary.id)
      .map((row) => ({
        categoryId: row.categoryId,
        isPublished: row.isPublished,
        isAvailable: row.isAvailable,
      })),
    hours: hourRows
      .filter((row) => row.tenantId === summary.id)
      .map((row) => ({ openTime: row.openTime, isClosed: row.isClosed })),
    ownerCount: Number(membershipRows.find((row) => row.tenantId === summary.id)?.people ?? 0),
  }));
}

/** Every tenant with its setup status, newest first. */
export async function listTenantSetups(
  act: AuthenticatedUser | null | undefined,
  find: TenantSetupFinder = findSetupFacts
): Promise<ServiceResult<OperatorTenantSetup[]>> {
  if (act?.role !== "operator") {
    return notStaff();
  }
  const facts = await find();
  return ok(facts.map(toTenantSetup));
}

/**
 * One tenant with its setup status. `null` means no such restaurant, which the
 * page turns into the same not-found page as anywhere else.
 */
export async function getTenantSetup(
  act: AuthenticatedUser | null | undefined,
  slug: string,
  find: TenantSetupFinder = findSetupFacts
): Promise<ServiceResult<OperatorTenantSetup | null>> {
  if (act?.role !== "operator") {
    return notStaff();
  }
  const facts = await find(slug);
  const first = facts[0];
  return ok(first ? toTenantSetup(first) : null);
}
