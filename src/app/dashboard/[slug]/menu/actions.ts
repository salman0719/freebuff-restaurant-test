/**
 * Category actions (Phase 3.4). Server-only: every action resolves the
 * membership-gated context from the posted `slug`, then delegates to the
 * scoped mutations in `tenant-data.ts` (validate → scope → save). Unknown
 * slugs and non-members get the same message (no oracle).
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTenantContext } from "@/lib/tenant-context";
import {
  createTenantCategory,
  deleteTenantCategory,
  moveTenantCategory,
  updateTenantCategory,
} from "@/lib/tenant-data";
import type { TenantContext } from "@/lib/tenant-context";
import { toCreateCategoryInput, toUpdateCategoryInput } from "./form";

export interface CategoryState {
  status: "idle" | "saved" | "error";
  message?: string;
  fields?: Record<string, string[]>;
  /** Echoed inputs so a rejected save keeps what was typed. */
  values?: { name: string; description: string; isPublished: boolean };
}

async function resolveContext(
  formData: FormData
): Promise<{ ok: true; context: TenantContext } | { ok: false; state: CategoryState }> {
  const session = await auth();
  const slug = formData.get("slug");
  const context = await getTenantContext(session, typeof slug === "string" ? slug : "");
  if (!context.ok) {
    return {
      ok: false,
      state: { status: "error", message: "You do not have access to this restaurant." },
    };
  }
  return { ok: true, context: context.data };
}

function echoValues(formData: FormData): CategoryState["values"] {
  const name = formData.get("name");
  const description = formData.get("description");
  return {
    name: typeof name === "string" ? name : "",
    description: typeof description === "string" ? description : "",
    isPublished: formData.get("isPublished") !== null,
  };
}

function menuPath(slug: string): string {
  return `/dashboard/${slug}/menu`;
}

export async function createCategory(
  _prevState: CategoryState,
  formData: FormData
): Promise<CategoryState> {
  const resolved = await resolveContext(formData);
  if (!resolved.ok) return resolved.state;
  const { context } = resolved;
  const created = await createTenantCategory(context, toCreateCategoryInput(formData));
  if (!created.ok) {
    if (created.error.code === "VALIDATION_FAILED") {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fields: created.error.fields,
        values: echoValues(formData),
      };
    }
    return { status: "error", message: "Could not create the category. Try again." };
  }
  revalidatePath(menuPath(context.tenant.slug));
  revalidatePath(`/dashboard/${context.tenant.slug}`);
  return { status: "saved", message: `Category “${created.data.name}” added.` };
}

export async function saveCategory(
  _prevState: CategoryState,
  formData: FormData
): Promise<CategoryState> {
  const resolved = await resolveContext(formData);
  if (!resolved.ok) return resolved.state;
  const { context } = resolved;
  const categoryId = formData.get("categoryId");
  if (typeof categoryId !== "string" || categoryId === "") {
    return { status: "error", message: "Could not save the category. Try again." };
  }
  const saved = await updateTenantCategory(context, categoryId, toUpdateCategoryInput(formData));
  if (!saved.ok) {
    if (saved.error.code === "VALIDATION_FAILED") {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fields: saved.error.fields,
        values: echoValues(formData),
      };
    }
    if (saved.error.code === "FORBIDDEN") {
      return { status: "error", message: "You do not have access to this restaurant." };
    }
    return { status: "error", message: "Could not save the category. Try again." };
  }
  revalidatePath(menuPath(context.tenant.slug));
  return { status: "saved", message: `Category “${saved.data.name}” saved.` };
}

export async function deleteCategory(
  _prevState: CategoryState,
  formData: FormData
): Promise<CategoryState> {
  const resolved = await resolveContext(formData);
  if (!resolved.ok) return resolved.state;
  const { context } = resolved;
  const categoryId = formData.get("categoryId");
  if (typeof categoryId !== "string" || categoryId === "") {
    return { status: "error", message: "Could not delete the category. Try again." };
  }
  const deleted = await deleteTenantCategory(context, categoryId);
  if (!deleted.ok) {
    if (deleted.error.code === "FORBIDDEN") {
      return { status: "error", message: "You do not have access to this restaurant." };
    }
    return { status: "error", message: "Could not delete the category. Try again." };
  }
  revalidatePath(menuPath(context.tenant.slug));
  revalidatePath(`/dashboard/${context.tenant.slug}`);
  redirect(menuPath(context.tenant.slug));
}

/**
 * Move up/down from the list page. Direction comes from our own buttons,
 * so anything invalid is unexpected — still revalidate rather than crash.
 */
export async function moveCategory(formData: FormData): Promise<void> {
  const resolved = await resolveContext(formData);
  if (!resolved.ok) return;
  const { context } = resolved;
  const categoryId = formData.get("categoryId");
  const direction = formData.get("direction");
  if (typeof categoryId !== "string" || (direction !== "up" && direction !== "down")) return;
  await moveTenantCategory(context, categoryId, { direction });
  revalidatePath(menuPath(context.tenant.slug));
}
