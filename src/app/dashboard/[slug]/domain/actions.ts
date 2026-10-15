/**
 * Domain claim actions (Phase 5.2, routing in 5.3). Server-only:
 * membership-gated context from the posted slug, then the scoped claim
 * flow — unknown slugs and non-members get the same message (no oracle).
 *
 * Success is reported only from a successful write or check. A CONFLICT
 * (another restaurant already holds the domain) surfaces with its field
 * key so the editor can show it inline; a failed DNS query is reported
 * as an error, never read as "your record is wrong".
 *
 * 5.3 wiring: verifying a claim also CONNECTS routing (attach to the
 * Vercel project) and removing one DISCONNECTS it. Both are best-effort
 * at the edges — a failed attach never un-verifies the durable claim and
 * a failed detach never blocks removal (the hostname resolver stops
 * honoring the domain the moment the claim is gone) — but each failure
 * is stated, never swallowed.
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  checkDomainClaim,
  getDomainClaim,
  removeDomainClaim,
  submitDomainClaim,
} from "@/lib/domain-claim";
import {
  connectRouting,
  disconnectRouting,
  getRoutingStatus,
  type RoutingStatus,
} from "@/lib/domain-routing";
import { getTenantContext } from "@/lib/tenant-context";

export interface DomainState {
  status: "idle" | "saved" | "verified" | "pending" | "routing" | "error";
  message?: string;
  fields?: Record<string, string[]>;
  routing?: RoutingStatus;
}

function accessRefused(): DomainState {
  return { status: "error", message: "You do not have access to this restaurant." };
}

export async function submitDomain(
  _prevState: DomainState,
  formData: FormData
): Promise<DomainState> {
  const session = await auth();
  const slug = formData.get("slug");
  const context = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!context.ok) {
    return accessRefused();
  }
  const result = await submitDomainClaim(context.data, formData.get("domain"));
  if (!result.ok) {
    if (result.error.code === "VALIDATION_FAILED" || result.error.code === "CONFLICT") {
      return { status: "error", message: result.error.message, fields: result.error.fields };
    }
    return { status: "error", message: "Could not save the domain. Try again." };
  }
  revalidatePath(`/dashboard/${context.data.tenant.slug}/domain`);
  return {
    status: "saved",
    message:
      result.data.status === "verified"
        ? "That domain is already verified for this restaurant."
        : "Domain recorded — publish the DNS record shown below, then check.",
  };
}

export async function verifyDomain(
  _prevState: DomainState,
  formData: FormData
): Promise<DomainState> {
  const session = await auth();
  const slug = formData.get("slug");
  const context = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!context.ok) {
    return accessRefused();
  }
  const result = await checkDomainClaim(context.data);
  if (!result.ok) {
    // NOT_FOUND means the form outlived the claim (removed in another
    // tab); the page reload will show the truth either way.
    return { status: "error", message: result.error.message };
  }
  revalidatePath(`/dashboard/${context.data.tenant.slug}/domain`);
  if (result.data.status === "verified") {
    // Verification is durable; routing is the next, separate fact.
    const routing = await connectRouting(result.data.domain);
    if (!routing.ok) {
      return {
        status: "verified",
        message: `Verified — but automatic routing setup failed: ${routing.error.message} Check the routing status below to retry.`,
      };
    }
    return {
      status: "verified",
      message:
        "Verified — connected to the platform edge. HTTPS usually follows within minutes; the routing status below tracks it.",
    };
  }
  return {
    status: "pending",
    message: "Not seen yet — the record can take a few minutes to appear. Try again shortly.",
  };
}

/**
 * Read the routing facts (Vercel attach/verify state + a real HTTPS
 * probe) and fold them into one honest state. Reads only — no write, so
 * no revalidation. The probe takes a few seconds; the button's pending
 * state covers it.
 */
export async function checkRouting(
  _prevState: DomainState,
  formData: FormData
): Promise<DomainState> {
  const session = await auth();
  const slug = formData.get("slug");
  const context = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!context.ok) {
    return accessRefused();
  }
  const claim = await getDomainClaim(context.data);
  if (!claim.ok || !claim.data.domain) {
    return { status: "error", message: "No custom domain is recorded for this restaurant." };
  }
  if (claim.data.status !== "verified") {
    return {
      status: "error",
      message:
        "Routing attaches after verification — publish the TXT record and check the domain first.",
    };
  }
  const routing = await getRoutingStatus(claim.data.domain);
  if (!routing.ok) {
    return { status: "error", message: routing.error.message };
  }
  return { status: "routing", routing: routing.data, message: routing.data.message };
}

export async function clearDomain(
  _prevState: DomainState,
  formData: FormData
): Promise<DomainState> {
  const session = await auth();
  const slug = formData.get("slug");
  const context = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!context.ok) {
    return accessRefused();
  }
  // Read the claim first: the removal itself clears the domain, and the
  // edge detach needs the address that was just released.
  const before = await getDomainClaim(context.data);
  const previousDomain = before.ok ? before.data.domain : null;
  const result = await removeDomainClaim(context.data);
  if (!result.ok) {
    return { status: "error", message: "Could not remove the domain. Try again." };
  }
  revalidatePath(`/dashboard/${context.data.tenant.slug}/domain`);
  // Best-effort: the resolver already stopped honoring the domain, so a
  // failed detach is stated, never allowed to block the removal.
  if (previousDomain) {
    const detached = await disconnectRouting(previousDomain);
    if (!detached.ok) {
      return {
        status: "saved",
        message: `Domain removed — it no longer serves this restaurant. Note: detaching it from the platform edge failed (${detached.error.message}) and may need a retry.`,
      };
    }
  }
  return {
    status: "saved",
    message: "Domain removed — the restaurant keeps its platform address.",
  };
}
