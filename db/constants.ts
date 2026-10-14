/**
 * Dependency-free shared constants (Phase 1.2).
 *
 * Single source of truth for the small fixed vocabularies used by both the
 * Drizzle schema (`./schema.ts`) and the shared domain contracts
 * (`src/lib/restaurant.ts`, `src/lib/validation.ts`). Kept free of any ORM
 * import so client bundles can use these without pulling in `drizzle-orm`.
 */

/**
 * Public themes the platform ships. Café and takeaway were the agreed MVP
 * pair; `bistro` joined in Phase C once the theme system could express a
 * genuinely different look; `diner` and `garden` are the appearance round
 * (docs/decisions/0004). Adding one is a product decision, not a refactor:
 * it widens the `tenants_theme_allowed` CHECK, so it ships with a
 * migration, and every reader of `THEME_IDS` (validation, registry, tests)
 * picks the new id up from here. `garden` used no migration — decision
 * 0004 widened the CHECK for both ids in one step, so the database was
 * already ahead of the app when the component landed.
 */
export const THEME_IDS = ["cafe", "takeaway", "bistro", "diner", "garden"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/**
 * Membership roles. A row in `memberships` is the only proof of access to a
 * specific tenant (see `docs/decisions/0003-tenant-identification.md`) —
 * platform operators appear here only when explicitly attached to a tenant.
 */
export const MEMBERSHIP_ROLES = ["owner", "operator"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/**
 * Operator actions the platform records (Phase 4.4).
 *
 * The vocabulary is closed on purpose: an audit trail is only worth reading
 * if the set of things it can say is small, spelled the same way every time,
 * and decided in one place. Adding a member here is a deliberate act — it
 * widens the `audit_events_action_allowed` CHECK, so it ships with a
 * migration, and `src/lib/audit.ts` must learn to describe it (an unknown
 * action renders as its raw key rather than crashing, so a row written by a
 * newer deploy still shows up).
 */
export const AUDIT_ACTIONS = ["tenant.created", "tenant.owner_granted"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Tenant slug format: lowercase alphanumerics joined with single hyphens.
 * Must stay identical to the `tenants_slug_format` CHECK in `./schema.ts`
 * (which inlines the same pattern in SQL) — `src/lib/db-schema.test.ts`
 * asserts the committed migration contains this exact string.
 */
export const SLUG_PATTERN = "^[a-z0-9]+(-[a-z0-9]+)*$" as const;
