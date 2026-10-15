/**
 * Hostname-to-tenant resolver (Phase 2.6). Server-only: imports the database.
 *
 * Implements `docs/decisions/0003-tenant-identification.md`:
 * 1. Normalise the hostname (lowercase, strip port).
 * 2. Exact match on a VERIFIED `custom_domain` → tenant (Phase 5.2).
 *    A claimed-but-unverified domain resolves to nothing: the claim flow
 *    (`src/lib/domain-claim.ts`) flips the row to 'verified' only after
 *    the TXT token is seen, so an unverified domain can never serve a
 *    tenant — the whole point of 5.2's "prevent an unverified domain
 *    from being attached to an arbitrary tenant".
 * 3. Else `{slug}.platform` subdomain → tenant by slug.
 * 4. Else not-found — never fall through to another tenant.
 *
 * Notes:
 * - Only the tenant identity (`id`, `slug`) leaves this module; callers
 *   load content through `getPublicRestaurant` (published gate) or
 *   `getTenantContext` (membership gate), which re-check visibility.
 * - Reserved subdomains (`www`, `api`, `app`, `admin`) short-circuit
 *   without a database hit: they address the platform, never a tenant.
 * - No cache in the MVP: correctness first. A hostname→tenant cache must
 *   invalidate on publish/slug/domain changes, so it waits for measured
 *   need (and must never cache personalised output across tenants).
 * - Local development: `PLATFORM_BASE_DOMAIN` unset means `localhost`, so
 *   `marios.localhost:4000` resolves slug `marios` (`*.localhost` resolves
 *   to 127.0.0.1 without any DNS setup). Canonical format and production
 *   setup: `docs/runbooks/platform-subdomains.md` (Phase 5.1).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { tenants } from "../../db/schema";
import { normalizeHostname, subdomainOf } from "./tenant-host";
import { RESERVED_SLUGS } from "./validation";

export interface ResolvedTenant {
  id: string;
  slug: string;
}

export type HostResolution = { found: true; tenant: ResolvedTenant } | { found: false };

const NOT_FOUND: HostResolution = { found: false };

function defaultBaseDomain(): string {
  return (process.env.PLATFORM_BASE_DOMAIN ?? "localhost").toLowerCase();
}

/**
 * Resolve a `Host` header value to a tenant. `baseDomain` defaults to
 * `PLATFORM_BASE_DOMAIN` (`localhost` for development).
 */
export async function resolveTenantByHost(
  host: string,
  baseDomain: string = defaultBaseDomain()
): Promise<HostResolution> {
  const hostname = normalizeHostname(host);
  if (!hostname) {
    return NOT_FOUND;
  }
  const byDomain = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(
      and(eq(tenants.customDomain, hostname), eq(tenants.customDomainStatus, "verified"))
    )
    .limit(1);
  if (byDomain[0]) {
    return { found: true, tenant: byDomain[0] };
  }
  const slug = subdomainOf(hostname, baseDomain.toLowerCase());
  if (!slug || (RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return NOT_FOUND;
  }
  const bySlug = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!bySlug[0]) {
    return NOT_FOUND;
  }
  return { found: true, tenant: bySlug[0] };
}
