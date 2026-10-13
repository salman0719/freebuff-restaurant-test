/**
 * Publish action (Phase 3.8). Server-only: resolves the
 * membership-gated context from the posted `slug`, then flips visibility
 * through the existing scoped `updateTenantSettings` (validate → scope →
 * save). Unknown slugs and non-members get the same message (no oracle).
 *
 * Success is reported only from a successful save — persistence failures
 * return an error state instead. Publishing is one click (reversible, and
 * nothing deletes); unpublishing takes the site down, so the UI confirms
 * it first.
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getTenantContext } from "@/lib/tenant-context";
import { updateTenantSettings } from "@/lib/tenant-data";

export interface PublishState {
  status: "idle" | "saved" | "error";
  message?: string;
}

export async function setPublished(
  _prevState: PublishState,
  formData: FormData
): Promise<PublishState> {
  const session = await auth();
  const slug = formData.get("slug");
  const context = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!context.ok) {
    return { status: "error", message: "You do not have access to this restaurant." };
  }
  const published = formData.get("published") === "true";
  const saved = await updateTenantSettings(context.data, { published });
  if (!saved.ok) {
    if (saved.error.code === "VALIDATION_FAILED") {
      return { status: "error", message: "That change was not valid. Try again." };
    }
    return { status: "error", message: "Could not update the publishing state. Try again." };
  }
  revalidatePath(`/dashboard/${context.data.tenant.slug}/publishing`);
  revalidatePath(`/dashboard/${context.data.tenant.slug}`);
  return {
    status: "saved",
    message: saved.data.published
      ? "Published — visitors can now find this restaurant."
      : "Unpublished — the public site is offline and only you can see the content.",
  };
}
