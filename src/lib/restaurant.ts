/**
 * Shared domain types for the MVP (Phase 1.2).
 *
 * These mirror the Drizzle schema (`db/schema.ts`) in plain TypeScript so
 * Server Components, route handlers, and (where safe) client components can
 * share one vocabulary. Creation/update payload shapes are NOT duplicated
 * here — they are inferred from the Zod schemas in `./validation.ts`.
 *
 * Two views, never mixed:
 * - `Public*` — published-only content for visitor pages (Phase 2.1 maps
 *   DB rows into these, dropping drafts and anything non-public).
 * - `Owner*` — the full private picture for the dashboard, always behind
 *   a membership check. Internal ids may appear in public views as opaque
 *   list keys only — never trust a client-sent id for authorisation (0003).
 */
import type { MembershipRole, ThemeId } from "../../db/constants";

export type { MembershipRole, ThemeId };

/** A tenant row: URL identity (`slug`), visibility, and theme choice. */
export interface Tenant {
  id: string;
  slug: string;
  customDomain: string | null;
  published: boolean;
  theme: ThemeId;
  createdAt: Date;
  updatedAt: Date;
}

/** Proof that `userId` may act on `tenantId` with `role`. */
export interface Membership {
  id: string;
  userId: string;
  tenantId: string;
  role: MembershipRole;
  createdAt: Date;
  updatedAt: Date;
}

/** One restaurant profile per tenant: name, contact, and location. */
export interface RestaurantProfile {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  /** Provider-neutral storage object key, never a provider URL. */
  logoImageKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One row per tenant per weekday (`weekday`: 0 = Sunday). */
export interface OpeningHoursRow {
  id: string;
  tenantId: string;
  weekday: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** An ordered menu category. */
export interface MenuCategory {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** A sellable menu item. Money is integer cents, never float. */
export interface MenuItem {
  id: string;
  tenantId: string;
  /** Null when uncategorised (e.g. its category was deleted). */
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  /** Provider-neutral storage object key, never a provider URL. */
  imageKey: string | null;
  sortOrder: number;
  isPublished: boolean;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicContact {
  phone: string | null;
  email: string | null;
}

export interface PublicAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface PublicMenuItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageKey: string | null;
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  description: string | null;
  items: PublicMenuItem[];
}

export interface PublicOpeningHours {
  weekday: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
}

/** Everything a visitor page may render. Published content only. */
export interface PublicRestaurant {
  slug: string;
  name: string;
  description: string | null;
  contact: PublicContact;
  address: PublicAddress;
  hours: PublicOpeningHours[];
  menu: PublicMenuCategory[];
  theme: ThemeId;
  logoImageKey: string | null;
}

/**
 * Everything an authorised member may manage. Only ever built after a
 * membership check for the requesting user (Phase 1.4 enforces this).
 */
export interface OwnerRestaurant {
  tenant: Tenant;
  profile: RestaurantProfile | null;
  hours: OpeningHoursRow[];
  categories: MenuCategory[];
  items: MenuItem[];
  membershipRole: MembershipRole;
}
