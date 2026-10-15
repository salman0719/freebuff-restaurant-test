/**
 * Theme actions (Phase 3.7; options in Phase C). Server-only: resolves the
 * membership-gated context from the posted `slug`, then delegates to the
 * scoped data layer (validate → scope → save). Unknown slugs and
 * non-members get the same message (no oracle).
 *
 * `saveTheme` posts one theme id per card — no client state needed, the
 * refreshed "Current" badge is the confirmation. `saveThemeOptions` edits
 * the CURRENT theme's options, so it returns state for inline feedback.
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getTenantContext } from "@/lib/tenant-context";
import { updateTenantSettings, updateTenantThemeConfig } from "@/lib/tenant-data";
import { themeToggle } from "@/themes/config";

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

export interface ThemeOptionsState {
  status: "idle" | "saved" | "error";
  message?: string;
}

export async function saveThemeOptions(
  _previous: ThemeOptionsState,
  formData: FormData
): Promise<ThemeOptionsState> {
  const session = await auth();
  const slug = formData.get("slug");
  const context = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!context.ok) {
    return { status: "error", message: "You do not have access to this restaurant." };
  }
  const themeId = context.data.tenant.theme;
  const text = (key: string): string | undefined => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };
  // Only the current theme's own toggle is submitted — the other theme's
  // option would be stripped anyway, but sending it would be misleading.
  // `themeToggle` is the shared source of truth for the key, so the form and
  // this write can never disagree again — before, every non-café theme read
  // the wrong field and its own schema stripped the value silently.
  const toggleName = themeToggle(themeId).name;
  const input: Record<string, unknown> = {
    accent: text("accent"),
    menuLayout: text("menuLayout"),
    [toggleName]: formData.get(toggleName) === "on",
  };
  const saved = await updateTenantThemeConfig(context.data, themeId, input);
  if (!saved.ok) {
    return { status: "error", message: "Check the options and try again." };
  }
  revalidatePath(`/dashboard/${context.data.tenant.slug}/theme`);
  revalidatePath(`/dashboard/${context.data.tenant.slug}/theme/preview`);
  return { status: "saved", message: "Theme options saved." };
}
