/**
 * Hours save action (Phase 3.3). Server-only: resolves the
 * membership-gated context, then delegates to `updateTenantHours`
 * (validate → scope → upsert the full week). Per-day failures surface
 * under `fields` keys like `"1.openTime"` (Zod array paths), which the
 * client form maps back onto each day's row.
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getTenantContext } from "@/lib/tenant-context";
import { updateTenantHours } from "@/lib/tenant-data";
import { WEEKDAY_LABELS, toHoursInput } from "./form";

export interface HoursState {
  status: "idle" | "saved" | "error";
  message?: string;
  fields?: Record<string, string[]>;
  /**
   * Echoed inputs so a rejected save keeps what was typed: per weekday,
   * the closed flag plus the raw time strings.
   */
  values?: { closed: boolean; openTime: string; closeTime: string }[];
}

function echoValues(formData: FormData): HoursState["values"] {
  return WEEKDAY_LABELS.map((_, weekday) => {
    const open = formData.get(`open-${weekday}`);
    const close = formData.get(`close-${weekday}`);
    return {
      closed: formData.get(`closed-${weekday}`) !== null,
      openTime: typeof open === "string" ? open : "",
      closeTime: typeof close === "string" ? close : "",
    };
  });
}

export async function saveHours(_prevState: HoursState, formData: FormData): Promise<HoursState> {
  const session = await auth();
  const slug = formData.get("slug");
  const context = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!context.ok) {
    // Same message for unknown slugs and non-members (no oracle).
    return { status: "error", message: "You do not have access to this restaurant." };
  }
  const saved = await updateTenantHours(context.data, toHoursInput(formData));
  if (!saved.ok) {
    if (saved.error.code === "VALIDATION_FAILED") {
      return {
        status: "error",
        message: "Check the highlighted days and try again.",
        fields: saved.error.fields,
        values: echoValues(formData),
      };
    }
    return { status: "error", message: "Could not save the hours. Try again." };
  }
  revalidatePath(`/dashboard/${context.data.tenant.slug}`);
  return { status: "saved", message: "Opening hours saved." };
}
