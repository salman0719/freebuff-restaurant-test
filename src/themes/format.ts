/**
 * Shared presentational helpers for themes. Formatting only — no data
 * access, no theme-specific logic.
 */

/** Format integer cents as a decimal price string (e.g. 1299 → "12.99"). */
export function formatPrice(priceCents: number): string {
  return (priceCents / 100).toFixed(2);
}
