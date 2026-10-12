/**
 * Pure profile-form mapping (Phase 3.2). Lives outside `actions.ts`
 * because `"use server"` modules may only export async functions.
 * Form blanks arrive as `""` and map to `null` (clear); unknown keys
 * (slug, logoImageKey) never reach the data layer.
 */

export const EDITABLE_KEYS = [
  "name",
  "description",
  "phone",
  "email",
  "addressLine1",
  "addressLine2",
  "city",
  "postalCode",
  "country",
] as const;

export function toProfileInput(formData: FormData): Record<string, string | null> {
  const input: Record<string, string | null> = {};
  for (const key of EDITABLE_KEYS) {
    const raw = formData.get(key);
    input[key] = typeof raw === "string" && raw !== "" ? raw : null;
  }
  return input;
}
