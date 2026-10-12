/**
 * Profile save action (Phase 3.2). Server-only: resolves the
 * membership-gated context, then delegates to `updateTenantProfile`
 * (validate → scope → save). Form blanks arrive as `""` and are mapped
 * to `null` (clear) before validation; the data layer rejects a cleared
 * name because the database requires one.
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getTenantContext } from "@/lib/tenant-context";
import { updateTenantProfile } from "@/lib/tenant-data";
import { EDITABLE_KEYS, toProfileInput } from "./form";

export interface ProfileState {
  status: "idle" | "saved" | "error";
  message?: string;
  fields?: Record<string, string[]>;
  /** Echoed inputs so a rejected save keeps what was typed. */
  values?: Record<string, string>;
}

function echoValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of EDITABLE_KEYS) {
    const raw = formData.get(key);
    values[key] = typeof raw === "string" ? raw : "";
  }
  return values;
}

export async function saveProfile(
  _prevState: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const session = await auth();
  const slug = formData.get("slug");
  const context = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!context.ok) {
    // Same message for unknown slugs and non-members (no oracle).
    return { status: "error", message: "You do not have access to this restaurant." };
  }
  const saved = await updateTenantProfile(context.data, toProfileInput(formData));
  if (!saved.ok) {
    if (saved.error.code === "VALIDATION_FAILED") {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fields: saved.error.fields,
        values: echoValues(formData),
      };
    }
    return { status: "error", message: "Could not save the profile. Try again." };
  }
  revalidatePath(`/dashboard/${context.data.tenant.slug}`);
  return { status: "saved", message: "Profile saved." };
}
