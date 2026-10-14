/**
 * Operator-facing tenant reads (Phase 4.2). Server-only: imports the
 * database.
 *
 * Reading across tenants needs the same explicit authorisation as writing
 * across them, and for the same reason: nothing here is scoped by a
 * `TenantContext`, so the staff check cannot be inherited from a caller's
 * context — it is re-checked at every entry point, and a caller that skipped
 * `requireOperator` gets `FORBIDDEN` rather than rows.
 *
 * These reads hand back setup FACTS and never tenant content: no menu items,
 * no hours values, no contact details. An operator needs to know whether a
 * restaurant is ready, not to read its unpublished drafts — wider staff
 * access is a Phase 4.4 decision, not something this module settles by
 * accident.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db";
import type { ThemeId } from "../../db/constants";
import { restaurantProfiles, tenants } from "../../db/schema";
import { getThemeDefinition } from "../themes/registry";
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

export type OperatorTenantFinder = (slug: string) => Promise<OperatorTenantRow | null>;

async function findTenantSummary(slug: string): Promise<OperatorTenantRow | null> {
  const rows = await db
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
    .where(eq(tenants.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * One tenant by slug, for the operator's detail view. `null` means no such
 * restaurant, which the page turns into the same not-found page as anywhere
 * else. The `find` seam defaults to the live query; tests inject fakes.
 */
export async function getOperatorTenant(
  act: AuthenticatedUser | null | undefined,
  slug: string,
  find: OperatorTenantFinder = findTenantSummary
): Promise<ServiceResult<OperatorTenantSummary | null>> {
  if (act?.role !== "operator") {
    return notStaff();
  }
  const row = await find(slug);
  return ok(row ? toOperatorTenantSummary(row) : null);
}
