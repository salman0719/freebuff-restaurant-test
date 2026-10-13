/**
 * Pure item-form mapping (Phase 3.5). Lives outside `actions.ts`
 * because `"use server"` modules may only export async functions
 * (same lesson as 3.1–3.4).
 *
 * Money crosses the form boundary as a dollars string (`"12.99"`) and is
 * parsed here to integer cents — the database never sees a float.
 * Unparseable prices map to `NaN` (still a `number` to TypeScript) so the
 * Zod schema rejects them keyed to `priceCents`; the actions then swap in
 * a dollars-worded message, since the schema speaks cents and the form
 * speaks dollars. Blanks map to `null`: for `description` that means
 * clear, for `name` the data layer rejects the clear. An empty category
 * select means uncategorised (`null`); anything else passes through for
 * schema + ownership checks downstream. `imageKey` never comes from the
 * form — uploads belong to 3.6 (same as the logo in 3.2).
 */

/** Parse a dollars string to integer cents, or `null` when not parseable. */
export function parsePriceToCents(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function textOrNull(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  return typeof raw === "string" && raw !== "" ? raw : null;
}

function categoryOrNull(formData: FormData): string | null {
  const raw = formData.get("categoryId");
  return typeof raw === "string" && raw !== "" ? raw : null;
}

export interface CreateItemInput {
  name: string | null;
  description: string | null;
  priceCents: number;
  categoryId: string | null;
}

export interface UpdateItemInput extends CreateItemInput {
  isPublished: boolean;
  isAvailable: boolean;
}

export function toCreateItemInput(formData: FormData): CreateItemInput {
  return {
    name: textOrNull(formData, "name"),
    description: textOrNull(formData, "description"),
    priceCents: parsePriceToCents(formData.get("price")) ?? NaN,
    categoryId: categoryOrNull(formData),
  };
}

export function toUpdateItemInput(formData: FormData): UpdateItemInput {
  return {
    ...toCreateItemInput(formData),
    isPublished: formData.get("isPublished") !== null,
    isAvailable: formData.get("isAvailable") !== null,
  };
}
