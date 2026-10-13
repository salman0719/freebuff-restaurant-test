/**
 * Item actions (Phase 3.5). Server-only: every action resolves the
 * membership-gated context from the posted `slug`, then delegates to the
 * scoped mutations in `tenant-data.ts`. Unknown slugs and non-members get
 * the same message (no oracle).
 *
 * The form posts dollars while the schema validates cents, so a
 * `priceCents` failure can only mean an unparseable dollars string (the
 * mapping emits non-negative integers or `NaN`) — the actions word it
 * that way instead of leaking the cents-level message.
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTenantContext, type TenantContext } from "@/lib/tenant-context";
import { createTenantItem, deleteTenantItem, updateTenantItem } from "@/lib/tenant-data";
import { toCreateItemInput, toUpdateItemInput } from "./form";

export interface ItemState {
  status: "idle" | "saved" | "error";
  message?: string;
  fields?: Record<string, string[]>;
  /** Echoed inputs so a rejected save keeps what was typed. */
  values?: {
    name: string;
    description: string;
    price: string;
    categoryId: string;
    isPublished: boolean;
    isAvailable: boolean;
  };
}

function withFriendlyPriceError(
  fields: Record<string, string[]> | undefined
): Record<string, string[]> | undefined {
  if (!fields || !fields["priceCents"]) return fields;
  return {
    ...fields,
    priceCents: ["Enter a valid price in dollars and cents, e.g. 12.99."],
  };
}

async function resolveContext(
  formData: FormData
): Promise<{ ok: true; context: TenantContext } | { ok: false; state: ItemState }> {
  const session = await auth();
  const slug = formData.get("slug");
  const result = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!result.ok) {
    return {
      ok: false,
      state: { status: "error", message: "You do not have access to this restaurant." },
    };
  }
  return { ok: true, context: result.data };
}

function echoValues(formData: FormData): ItemState["values"] {
  const text = (key: string): string => {
    const raw = formData.get(key);
    return typeof raw === "string" ? raw : "";
  };
  return {
    name: text("name"),
    description: text("description"),
    price: text("price"),
    categoryId: text("categoryId"),
    isPublished: formData.get("isPublished") !== null,
    isAvailable: formData.get("isAvailable") !== null,
  };
}

function itemsPath(slug: string): string {
  return `/dashboard/${slug}/menu/items`;
}

export async function createItem(_prevState: ItemState, formData: FormData): Promise<ItemState> {
  const resolved = await resolveContext(formData);
  if (!resolved.ok) return resolved.state;
  const { context } = resolved;
  const created = await createTenantItem(context, toCreateItemInput(formData));
  if (!created.ok) {
    if (created.error.code === "VALIDATION_FAILED") {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fields: withFriendlyPriceError(created.error.fields),
        values: echoValues(formData),
      };
    }
    if (created.error.code === "FORBIDDEN") {
      return { status: "error", message: "You do not have access to this restaurant." };
    }
    return { status: "error", message: "Could not create the item. Try again." };
  }
  revalidatePath(itemsPath(context.tenant.slug));
  revalidatePath(`/dashboard/${context.tenant.slug}/menu`);
  return { status: "saved", message: `Item “${created.data.name}” added.` };
}

export async function saveItem(_prevState: ItemState, formData: FormData): Promise<ItemState> {
  const resolved = await resolveContext(formData);
  if (!resolved.ok) return resolved.state;
  const { context } = resolved;
  const itemId = formData.get("itemId");
  if (typeof itemId !== "string" || itemId === "") {
    return { status: "error", message: "Could not save the item. Try again." };
  }
  const saved = await updateTenantItem(context, itemId, toUpdateItemInput(formData));
  if (!saved.ok) {
    if (saved.error.code === "VALIDATION_FAILED") {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fields: withFriendlyPriceError(saved.error.fields),
        values: echoValues(formData),
      };
    }
    if (saved.error.code === "FORBIDDEN") {
      return { status: "error", message: "You do not have access to this restaurant." };
    }
    return { status: "error", message: "Could not save the item. Try again." };
  }
  revalidatePath(itemsPath(context.tenant.slug));
  return { status: "saved", message: `Item “${saved.data.name}” saved.` };
}

export async function deleteItem(_prevState: ItemState, formData: FormData): Promise<ItemState> {
  const resolved = await resolveContext(formData);
  if (!resolved.ok) return resolved.state;
  const { context } = resolved;
  const itemId = formData.get("itemId");
  if (typeof itemId !== "string" || itemId === "") {
    return { status: "error", message: "Could not delete the item. Try again." };
  }
  const deleted = await deleteTenantItem(context, itemId);
  if (!deleted.ok) {
    if (deleted.error.code === "FORBIDDEN") {
      return { status: "error", message: "You do not have access to this restaurant." };
    }
    return { status: "error", message: "Could not delete the item. Try again." };
  }
  revalidatePath(itemsPath(context.tenant.slug));
  revalidatePath(`/dashboard/${context.tenant.slug}/menu`);
  redirect(itemsPath(context.tenant.slug));
}
