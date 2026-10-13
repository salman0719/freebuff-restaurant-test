/**
 * Profile save action (Phase 3.2, logo in 3.6). Server-only: resolves the
 * membership-gated context, then delegates to `updateTenantProfile`
 * (validate → scope → save). Form blanks arrive as `""` and are mapped
 * to `null` (clear) before validation; the data layer rejects a cleared
 * name because the database requires one.
 *
 * A selected logo file uploads after the fields save (fields-first, so a
 * field failure changes nothing). A logo failure then reports honestly —
 * "profile saved, logo not" — instead of claiming full success.
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getTenantContext } from "@/lib/tenant-context";
import { isErr } from "@/lib/result";
import { setTenantLogo, updateTenantProfile } from "@/lib/tenant-data";
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
  const logo = formData.get("logo");
  if (typeof File !== "undefined" && logo instanceof File && logo.size > 0) {
    const linked = await setTenantLogo(context.data, logo);
    if (isErr(linked)) {
      const reason =
        linked.error.fields?.["image"]?.[0] ??
        linked.error.fields?.["name"]?.[0] ??
        "Could not use that logo.";
      return {
        status: "error",
        message: `Profile saved, but the logo was not updated: ${reason}`,
        fields: linked.error.fields,
        values: echoValues(formData),
      };
    }
  }
  revalidatePath(`/dashboard/${context.data.tenant.slug}`);
  return { status: "saved", message: "Profile saved." };
}
