/**
 * Theme save action (Phase 3.7). Server-only: resolves the
 * membership-gated context from the posted `slug`, then delegates to the
 * existing `updateTenantSettings` (validate → scope → save) with the
 * chosen theme. Unknown slugs and non-members get the same message (no
 * oracle). Each theme card posts its own form, so no client state is
 * needed — the refreshed "Current" badge is the confirmation.
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getTenantContext } from "@/lib/tenant-context";
import { updateTenantSettings } from "@/lib/tenant-data";

export async function saveTheme(formData: FormData): Promise<void> {
  const session = await auth();
  const slug = formData.get("slug");
  const context = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!context.ok) {
    return;
  }
  const theme = formData.get("theme");
  await updateTenantSettings(context.data, {
    theme: typeof theme === "string" ? theme : undefined,
  });
  revalidatePath(`/dashboard/${context.data.tenant.slug}/theme`);
  revalidatePath(`/dashboard/${context.data.tenant.slug}`);
}
