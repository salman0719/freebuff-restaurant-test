/**
 * Server-side validation schemas for the MVP (Phase 1.2).
 *
 * Single source of input rules: UI forms may reuse these for instant
 * feedback, but the server always re-validates — client checks are never
 * a substitute for these. Every rule here must stay compatible with the
 * database constraints in `db/schema.ts` (the DB is the final gate):
 * compatible means "validation accepts a subset of what the DB allows",
 * never the reverse.
 *
 * Input payload types are inferred (`z.infer`) so shapes exist exactly
 * once. Slugs are validated but never updatable — they are effectively
 * immutable (see `docs/decisions/0003-tenant-identification.md`), so no
 * update schema below accepts one.
 */
import { z } from "zod";
import { MEMBERSHIP_ROLES, SLUG_PATTERN, THEME_IDS } from "../../db/constants";

/**
 * Subdomains reserved for the platform itself (0003). Rejected at creation
 * alongside duplicates and malformed slugs.
 */
export const RESERVED_SLUGS = ["www", "api", "app", "admin"] as const;

const slugRegex = new RegExp(SLUG_PATTERN);

/** Tenant slug: URL-safe, 1–63 chars (DNS label limit), not reserved. */
export const slugSchema = z
  .string()
  .min(1, "Slug is required.")
  .max(63, "Slug must be at most 63 characters.")
  .regex(slugRegex, "Slug must be lowercase letters, digits, and single hyphens.")
  .refine((slug) => !RESERVED_SLUGS.includes(slug as (typeof RESERVED_SLUGS)[number]), {
    message: "Slug is reserved for platform use.",
  });

/**
 * Custom-domain hostname (Phase 5.2). Written ONLY through the claim flow
 * (`./domain-claim.ts`) so state and token move with it — never through a
 * generic settings update, which would leave a domain the resolver must
 * not honor yet (the schema CHECKs refuse that pairing outright).
 */
export const customDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/, "Custom domain must be a valid hostname.")
  .nullish();

export const themeSchema = z.enum(THEME_IDS);

export const membershipRoleSchema = z.enum(MEMBERSHIP_ROLES);

/** Owner sign-in identity (Phase 1.3 owns the actual auth flow). */
export const emailSchema = z.string().trim().email("Must be a valid email address.");

/** `HH:MM` 24-hour clock, matching the DB `time` columns. */
export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM in 24-hour format.");

const nameSchema = (label: string, max = 120) =>
  z.string().trim().min(1, `${label} is required.`).max(max);

const optionalText = (max: number) => z.string().trim().max(max).nullish();

/** Operator creates a tenant with safe defaults (Phase 4 owns the UI). */
export const createTenantSchema = z.object({
  slug: slugSchema,
  /** Initial restaurant name for the profile created alongside. */
  name: nameSchema("Restaurant name"),
  theme: themeSchema.default("cafe"),
  published: z.boolean().default(false),
});

/**
 * Tenant updates. No `slug` field on purpose — renames break URLs and
 * incoming links, so they need a dedicated redirect flow, not an edit.
 * No `customDomain` either: domain claims move through `./domain-claim.ts`
 * with their verification state (5.2).
 */
export const updateTenantSchema = z.object({
  theme: themeSchema.optional(),
  published: z.boolean().optional(),
});

const profileFields = {
  name: nameSchema("Restaurant name").nullish(),
  description: optionalText(2000),
  phone: optionalText(32),
  email: z.union([emailSchema, z.literal("")]).nullish(),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(120),
  postalCode: optionalText(32),
  country: optionalText(120),
  logoImageKey: optionalText(512),
};

/** Owner edits contact/location details; absent stays, null clears. */
export const updateProfileSchema = z.object(profileFields);

/**
 * One day's hours. Closed days carry no times (no ambiguous "00:00"
 * stand-ins); open days need both. Overnight ranges (18:00–02:00) are
 * legal, so no open-before-close check here — same as the DB.
 */
export const openingHoursSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    openTime: timeStringSchema.nullish(),
    closeTime: timeStringSchema.nullish(),
    isClosed: z.boolean().default(false),
  })
  .refine(
    (hours) =>
      hours.isClosed ? !hours.openTime && !hours.closeTime : !!hours.openTime && !!hours.closeTime,
    {
      message: "Closed days must have no times; open days need both opening and closing times.",
    }
  );

/**
 * Full-week hours replacement. The dashboard always saves all seven days
 * atomically so visitors never see a half-edited week; weekdays must be
 * unique and cover 0–6 exactly (missing-day ambiguity is a rendering bug
 * — see `HoursList`, which only renders stored rows).
 */
export const updateHoursSchema = z
  .array(openingHoursSchema)
  .length(7, "Hours must cover all seven days.")
  .refine((days) => new Set(days.map((day) => day.weekday)).size === 7, {
    message: "Each weekday must appear exactly once.",
  });

const categoryFields = {
  name: nameSchema("Category name"),
  description: optionalText(2000),
  sortOrder: z.number().int().default(0),
  isPublished: z.boolean().default(true),
};

/**
 * Reorder direction for dashboard move up/down buttons. The data layer
 * renumbers the whole list by index, so moves work even when several
 * categories share the same `sortOrder` (e.g. seed data).
 */
export const categoryMoveSchema = z.object({
  direction: z.enum(["up", "down"]),
});

export const createCategorySchema = z.object(categoryFields);

export const updateCategorySchema = z.object({
  name: nameSchema("Category name").nullish(),
  description: optionalText(2000),
  sortOrder: z.number().int().nullish(),
  isPublished: z.boolean().nullish(),
});

const itemFields = {
  name: nameSchema("Item name"),
  description: optionalText(2000),
  /** Integer cents, never float — mirrors the DB check. */
  priceCents: z.number().int().min(0, "Price cannot be negative."),
  categoryId: z.string().uuid().nullish(),
  imageKey: optionalText(512),
  sortOrder: z.number().int().default(0),
  isPublished: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
};

export const createItemSchema = z.object(itemFields);

export const updateItemSchema = z.object({
  name: nameSchema("Item name").nullish(),
  description: optionalText(2000),
  priceCents: z.number().int().min(0, "Price cannot be negative.").nullish(),
  categoryId: z.string().uuid().nullish(),
  imageKey: optionalText(512),
  sortOrder: z.number().int().nullish(),
  isPublished: z.boolean().nullish(),
  isAvailable: z.boolean().nullish(),
});

/** Operator assigns an owner to a tenant (user id format owned by Phase 1.3). */
export const assignMembershipSchema = z.object({
  userId: z.string().trim().min(1, "User id is required."),
  role: membershipRoleSchema.default("owner"),
});

export const inviteOwnerSchema = z.object({ email: emailSchema });

/**
 * Operator grants owner access to one restaurant by email (Phase 4.2).
 *
 * One operation covers both cases an operator actually has — assigning
 * someone who has signed in before, and inviting someone who has not —
 * because the operator never holds an internal user id, so email is the only
 * identifier they can type. `slug` addresses the tenant; `role` defaults to
 * `owner`.
 */
export const assignOwnerSchema = inviteOwnerSchema.extend({
  slug: slugSchema,
  role: membershipRoleSchema.default("owner"),
});

/**
 * Operator grants the platform staff role by email. No account is created:
 * staff access is granted to someone who already exists, so a typo cannot
 * invent a privileged account — it fails as "no such person" instead.
 */
export const grantStaffSchema = inviteOwnerSchema;

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type OpeningHoursInput = z.infer<typeof openingHoursSchema>;
export type UpdateHoursInput = z.infer<typeof updateHoursSchema>;
export type CategoryMoveInput = z.infer<typeof categoryMoveSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type AssignMembershipInput = z.infer<typeof assignMembershipSchema>;
export type InviteOwnerInput = z.infer<typeof inviteOwnerSchema>;
export type AssignOwnerInput = z.infer<typeof assignOwnerSchema>;
export type GrantStaffInput = z.infer<typeof grantStaffSchema>;

/**
 * Map a Zod failure to field-keyed messages for `ServiceError.fields`
 * (see `./result.ts`). Version-proof: uses only the stable `.issues`
 * surface (`path` + `message`).
 */
export function validationFields(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}
