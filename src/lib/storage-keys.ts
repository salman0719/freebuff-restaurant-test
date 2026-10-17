/**
 * Object-storage key shape (R2 swap, commit 1). Pure and client-safe: no
 * filesystem or network access, so drivers, routes, and tests share one
 * allowlist instead of duplicating the pattern.
 *
 * Keys are server-generated (`tenants/{uuid}/logos|items/{uuid}.{ext}`),
 * unguessable, and re-validated on every read/write — traversal is
 * structurally impossible. The bucket stays private; serving flows through
 * `/api/images/[...key]`.
 */
import { randomUUID } from "node:crypto";

const KEY_PATTERN = /^tenants\/[0-9a-f-]{36}\/(logos|items)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Strict allowlist: only keys this module could have generated. */
export function isValidObjectKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Build the key for an upload. The tenant prefix keeps ownership evident
 * (and future R2 prefix policies trivial); the random tail keeps URLs
 * unguessable and ignores the user-supplied filename entirely.
 */
export function buildObjectKey(
  kind: "logos" | "items",
  tenantId: string,
  extension: string
): string {
  return `tenants/${tenantId}/${kind}/${randomUUID()}.${extension}`;
}
