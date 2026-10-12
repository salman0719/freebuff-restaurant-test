/**
 * Hostname helpers for tenant resolution (see
 * `docs/decisions/0003-tenant-identification.md`).
 * Pure functions — safe to unit test, no request APIs inside.
 */

/** Lowercase a Host header value and strip any `:port` suffix. */
export function normalizeHostname(host: string): string {
  return host.toLowerCase().split(":")[0] ?? "";
}

/**
 * Extract the single-level subdomain of `hostname` relative to
 * `baseDomain` (e.g. `marios` from `marios.example.com`).
 * Returns null for the apex, nested subdomains, or other domains.
 */
export function subdomainOf(hostname: string, baseDomain: string): string | null {
  const normalized = hostname.toLowerCase();
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!normalized.endsWith(suffix)) return null;
  const sub = normalized.slice(0, -suffix.length);
  if (!sub || sub.includes(".")) return null;
  return sub;
}
