/**
 * Domain claim actions (Phase 5.2). Server-only: membership-gated context
 * from the posted slug, then the scoped claim flow — unknown slugs and
 * non-members get the same message (no oracle).
 *
 * Success is reported only from a successful write or check. A CONFLICT
 * (another restaurant already holds the domain) surfaces with its field
 * key so the editor can show it inline; a failed DNS query is reported
 * as an error, never read as "your record is wrong".
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { checkDomainClaim, removeDomainClaim, submitDomainClaim } from "@/lib/domain-claim";
import { getTenantContext } from "@/lib/tenant-context";

export interface DomainState {
  status: "idle" | "saved" | "verified" | "pending" | "error";
  message?: string;
  fields?: Record<string, string[]>;
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
    return { status: "verified", message: "Verified — your DNS record was found." };
  }
  return {
    status: "pending",
    message: "Not seen yet — the record can take a few minutes to appear. Try again shortly.",
  };
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
  const result = await removeDomainClaim(context.data);
  if (!result.ok) {
    return { status: "error", message: "Could not remove the domain. Try again." };
  }
  revalidatePath(`/dashboard/${context.data.tenant.slug}/domain`);
  return {
    status: "saved",
    message: "Domain removed — the restaurant keeps its platform address.",
  };
}
