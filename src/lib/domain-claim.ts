/**
 * Custom-domain claim flow (Phase 5.2). Server-only: imports the database
 * and DNS.
 *
 * A custom domain starts as a CLAIM and becomes real only through proof:
 *
 * 1. `submitDomainClaim` records the domain with a fresh TXT token and
 *    status `pending`, scoped to the context tenant — never a caller-
 *    supplied id. A domain another tenant already claimed is refused
 *    (unique index surfaced as `CONFLICT`, keyed to the field): one
 *    hostname may address at most one restaurant, and squatting a pending
 *    claim must not be possible. Re-submitting the SAME domain keeps the
 *    token, so a TXT record the owner already published keeps working.
 * 2. `checkDomainClaim` reads `_restaurant-platform.<domain>` and flips
 *    the row to `verified` only when a TXT value equals the token — proof
 *    the submitter controls the domain's DNS. The lookup is injectable,
 *    so tests never depend on real DNS.
 * 3. `removeDomainClaim` clears domain, state, and token together.
 *
 * Two boundaries this module deliberately draws:
 * - Verification proves OWNERSHIP, not liveness. Routing and HTTPS are
 *   Phase 5.3, which is why the operator checklist keeps reporting a
 *   domain as merely RECORDED even after the TXT check passes.
 * - The hostname resolver (`./tenant-resolution.ts`) honors the row only
 *   at `verified`, so an unverified claim can never serve a tenant.
 */
import { randomUUID } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { tenants } from "../../db/schema";
import type { DomainStatus } from "../../db/schema";
import { isUniqueViolation } from "./db-errors";
import { err, ok, type ServiceResult } from "./result";
import type { TenantContext } from "./tenant-context";
import { customDomainSchema, validationFields } from "./validation";

/** The TXT record label a claimant publishes under their domain. */
export const VERIFY_RECORD_LABEL = "_restaurant-platform";

/** `_restaurant-platform.<domain>` — the exact record to publish. */
export function verificationRecordName(domain: string): string {
  return `${VERIFY_RECORD_LABEL}.${domain}`;
}

/** The owner-facing snapshot of a tenant's claim. */
export interface DomainClaim {
  domain: string | null;
  status: DomainStatus;
  verifyToken: string | null;
}

/**
 * Map stored columns to the claim shape. Defensive: the schema CHECKs keep
 * domain and state together, but a `none` row always reports the clean
 * empty claim regardless of stray columns, so callers never see a domain
 * without a state or a state without a domain.
 */
export function toDomainClaim(row: {
  customDomain: string | null;
  customDomainStatus: string;
  customDomainVerifyToken: string | null;
}): DomainClaim {
  if (!row.customDomain) {
    return { domain: null, status: "none", verifyToken: null };
  }
  return {
    domain: row.customDomain,
    status: (row.customDomainStatus === "verified" ? "verified" : "pending") as DomainStatus,
    verifyToken: row.customDomainVerifyToken,
  };
}

/**
 * Compare TXT answer chunks against the token. DNS splits long strings at
 * 255 characters, so a record arrives as an array of chunks — joined
 * before comparing, trimmed so a trailing newline an operator's DNS panel
 * added cannot fail a correct proof.
 */
export function matchesVerification(records: string[][], token: string | null): boolean {
  if (!token) return false;
  return records.some((chunks) => chunks.join("").trim() === token);
}

/** Injectable DNS seam: `name` → TXT answer chunks (empty when absent). */
export type DnsTxtLookup = (name: string) => Promise<string[][]>;

async function defaultTxtLookup(name: string): Promise<string[][]> {
  try {
    return await resolveTxt(name);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    // No such record is the normal "not published yet" answer, not a
    // failure. Anything else (timeout, SERVFAIL) surfaces to the caller.
    if (code === "ENODATA" || code === "ENOTFOUND") return [];
    throw error;
  }
}

const claimColumns = {
  customDomain: tenants.customDomain,
  customDomainStatus: tenants.customDomainStatus,
  customDomainVerifyToken: tenants.customDomainVerifyToken,
} as const;

/** The three claim columns as they come back from a read or `.returning()`. */
interface ClaimRow {
  customDomain: string | null;
  customDomainStatus: string;
  customDomainVerifyToken: string | null;
}

async function readClaim(tenantId: string): Promise<DomainClaim | null> {
  const rows = await db.select(claimColumns).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const row = rows[0];
  return row ? toDomainClaim(row) : null;
}

function missing(): ServiceResult<DomainClaim> {
  return err("NOT_FOUND", "Restaurant not found.");
}

/** Read the context tenant's claim (empty claim when none exists). */
export async function getDomainClaim(ctx: TenantContext): Promise<ServiceResult<DomainClaim>> {
  const claim = await readClaim(ctx.tenant.id);
  if (!claim) return missing();
  return ok(claim);
}

/**
 * Record a domain claim: validate → read current → write pending.
 * The unique index (not a pre-read) is what refuses a domain another
 * tenant holds, so two simultaneous claims resolve to exactly one winner.
 */
export async function submitDomainClaim(
  ctx: TenantContext,
  input: unknown
): Promise<ServiceResult<DomainClaim>> {
  const parsed = customDomainSchema.safeParse(input);
  if (!parsed.success) {
    // The whole input IS the domain field: a top-level failure has an
    // empty path (keyed `_form` by `validationFields`), but the editor
    // shows errors inline, so key them to the field they describe.
    const fields = validationFields(parsed.error);
    return err("VALIDATION_FAILED", "Invalid domain.", {
      domain: fields._form ?? ["Enter a valid hostname."],
    });
  }
  if (!parsed.data) {
    return err("VALIDATION_FAILED", "Invalid domain.", {
      domain: ["Enter the domain you want this restaurant to use."],
    });
  }
  const domain = parsed.data;
  const current = await readClaim(ctx.tenant.id);
  if (!current) return missing();
  if (current.domain === domain) {
    // Same claim re-submitted: keep the token so an already-published
    // TXT record keeps verifying, and keep `verified` if it got there.
    return ok(current);
  }
  let updated: ClaimRow[];
  try {
    updated = await db
      .update(tenants)
      .set({
        customDomain: domain,
        customDomainStatus: "pending",
        customDomainVerifyToken: randomUUID(),
      })
      .where(eq(tenants.id, ctx.tenant.id))
      .returning(claimColumns);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return err("CONFLICT", "That domain is already claimed by another restaurant.", {
        domain: ["That domain already points at another restaurant."],
      });
    }
    throw error;
  }
  const row = updated[0];
  if (!row) return err("INTERNAL", "Could not save the domain.");
  return ok(toDomainClaim(row));
}

/** What a verification check found — enough to word the UI honestly. */
export interface DomainCheckResult {
  domain: string;
  status: Exclude<DomainStatus, "none">;
  /** Whether the TXT record was present (pending + absent differs from wrong value). */
  recordSeen: boolean;
}

/**
 * Verify the context tenant's claim against DNS: read → lookup → flip to
 * `verified` only on an exact token match. A lookup failure is reported
 * (`INTERNAL`) rather than guessed either way — "we could not ask DNS"
 * must never read as "your record is wrong".
 */
export async function checkDomainClaim(
  ctx: TenantContext,
  lookup: DnsTxtLookup = defaultTxtLookup
): Promise<ServiceResult<DomainCheckResult>> {
  const rows = await db
    .select(claimColumns)
    .from(tenants)
    .where(eq(tenants.id, ctx.tenant.id))
    .limit(1);
  const row = rows[0];
  if (!row || !row.customDomain) {
    return err("NOT_FOUND", "No custom domain has been submitted yet.");
  }
  const claim = toDomainClaim(row);
  const domain = row.customDomain;
  if (claim.status === "verified") {
    return ok({ domain, status: "verified", recordSeen: true });
  }
  let records: string[][];
  try {
    records = await lookup(verificationRecordName(domain));
  } catch {
    return err(
      "INTERNAL",
      "Could not query the domain's DNS right now. Wait a moment for the record to propagate, then try again."
    );
  }
  if (!matchesVerification(records, claim.verifyToken)) {
    return ok({ domain, status: "pending", recordSeen: false });
  }
  const updated = await db
    .update(tenants)
    .set({ customDomainStatus: "verified" })
    .where(eq(tenants.id, ctx.tenant.id))
    .returning(claimColumns);
  const saved = updated[0];
  if (!saved) return err("INTERNAL", "Could not save the verification.");
  return ok({ domain, status: "verified", recordSeen: true });
}

/**
 * Clear the claim: domain, state, and token move together so the row can
 * never hold a domain the resolver would honor without a state (the
 * `tenants_custom_domain_claim_present` CHECK enforces exactly that).
 */
export async function removeDomainClaim(ctx: TenantContext): Promise<ServiceResult<DomainClaim>> {
  const updated = await db
    .update(tenants)
    .set({ customDomain: null, customDomainStatus: "none", customDomainVerifyToken: null })
    .where(eq(tenants.id, ctx.tenant.id))
    .returning(claimColumns);
  const row = updated[0];
  if (!row) return missing();
  return ok(toDomainClaim(row));
}
