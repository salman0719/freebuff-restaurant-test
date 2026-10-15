/**
 * Hostname helpers for tenant resolution (see
 * `docs/decisions/0003-tenant-identification.md`).
 * Pure functions — safe to unit test, no request APIs inside.
 */

/**
 * Normalise a Host header value: trim, lowercase, strip any `:port` suffix
 * and one FQDN trailing dot (`marios.example.com.` → `marios.example.com`).
 *
 * Port stripping is deliberately narrow: only a single `:` (the
 * `host:port` shape) is treated as a port separator. Bracketed IPv6
 * literals (`[::1]:4000` → `[::1]`) drop the port; bare IPv6 with several
 * colons is left alone — it can never be a tenant host, and mangling it
 * into a prefix would be worse than passing it through to a miss.
 */
export function normalizeHostname(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    if (close === -1) return trimmed;
    return trimmed.slice(0, close + 1);
  }
  const colonCount = (trimmed.match(/:/g) ?? []).length;
  const bare = colonCount === 1 ? (trimmed.split(":")[0] ?? "") : trimmed;
  return bare.length > 1 ? bare.replace(/\.+$/, "") : bare;
}

/**
 * Extract the single-level subdomain of `hostname` relative to
 * `baseDomain` (e.g. `marios` from `marios.example.com`).
 * Returns null for the apex, nested subdomains, or other domains.
 */
export function subdomainOf(hostname: string, baseDomain: string): string | null {
  const normalized = hostname.trim().toLowerCase().replace(/\.+$/, "");
  const base = baseDomain.trim().toLowerCase().replace(/\.+$/, "");
  if (!base || !normalized) return null;
  // The base is a bare domain name, never a URL, host:port, or path.
  if (/[\s/:]/.test(base)) return null;
  const suffix = `.${base}`;
  if (!normalized.endsWith(suffix)) return null;
  const sub = normalized.slice(0, -suffix.length);
  if (!sub || sub.includes(".")) return null;
  return sub;
}
