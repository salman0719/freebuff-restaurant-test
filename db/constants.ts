/**
 * Dependency-free shared constants (Phase 1.2).
 *
 * Single source of truth for the small fixed vocabularies used by both the
 * Drizzle schema (`./schema.ts`) and the shared domain contracts
 * (`src/lib/restaurant.ts`, `src/lib/validation.ts`). Kept free of any ORM
 * import so client bundles can use these without pulling in `drizzle-orm`.
 */

/** Public themes agreed for the MVP (product-scope sign-off). */
export const THEME_IDS = ["cafe", "takeaway"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/**
 * Membership roles. A row in `memberships` is the only proof of access to a
 * specific tenant (see `docs/decisions/0003-tenant-identification.md`) —
 * platform operators appear here only when explicitly attached to a tenant.
 */
export const MEMBERSHIP_ROLES = ["owner", "operator"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/**
 * Tenant slug format: lowercase alphanumerics joined with single hyphens.
 * Must stay identical to the `tenants_slug_format` CHECK in `./schema.ts`
 * (which inlines the same pattern in SQL) — `src/lib/db-schema.test.ts`
 * asserts the committed migration contains this exact string.
 */
export const SLUG_PATTERN = "^[a-z0-9]+(-[a-z0-9]+)*$" as const;
