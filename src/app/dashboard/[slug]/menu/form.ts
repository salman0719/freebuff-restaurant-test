/**
 * Pure category-form mapping (Phase 3.4). Lives outside `actions.ts`
 * because `"use server"` modules may only export async functions
 * (same lesson as 3.1–3.3).
 *
 * Blanks arrive as `""` and map to `null`: for `description` that means
 * clear, for `name` the data layer rejects the clear because the
 * database requires one. `isPublished` is a checkbox — present means
 * checked — and always maps to an explicit boolean so unchecking
 * deactivates instead of silently keeping the old value. `sortOrder`
 * never comes from the form: the server owns display order (new
 * categories go last, the move buttons renumber).
 */

function textOrNull(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  return typeof raw === "string" && raw !== "" ? raw : null;
}

export function toCreateCategoryInput(formData: FormData): {
  name: string | null;
  description: string | null;
} {
  return {
    name: textOrNull(formData, "name"),
    description: textOrNull(formData, "description"),
  };
}

export function toUpdateCategoryInput(formData: FormData): {
  name: string | null;
  description: string | null;
  isPublished: boolean;
} {
  return {
    name: textOrNull(formData, "name"),
    description: textOrNull(formData, "description"),
    isPublished: formData.get("isPublished") !== null,
  };
}
