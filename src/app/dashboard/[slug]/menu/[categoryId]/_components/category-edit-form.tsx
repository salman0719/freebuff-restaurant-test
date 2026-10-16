/**
 * Category edit form (Phase 3.4). Client component: owns two
 * `useActionState` round-trips — saving (keeps typed input on rejection,
 * confirms via `role="status"`) and deletion (two-step confirm so a
 * category holding items cannot be removed by a stray click; success
 * redirects to the list from the server).
 */
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirmFocus } from "@/components/ui/confirm-focus";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MenuCategory } from "@/lib/restaurant";
import { deleteCategory, saveCategory, type CategoryState } from "../../actions";

function fieldError(fields: Record<string, string[]> | undefined, key: string): string | undefined {
  return fields?.[key]?.[0];
}

export function CategoryEditForm({
  slug,
  category,
  itemCount,
}: {
  slug: string;
  category: MenuCategory;
  itemCount: number;
}) {
  const [saveState, saveAction, savePending] = useActionState<CategoryState, FormData>(
    saveCategory,
    { status: "idle" }
  );
  const [deleteState, deleteAction, deletePending] = useActionState<CategoryState, FormData>(
    deleteCategory,
    { status: "idle" }
  );
  const [confirming, setConfirming] = useState(false);
  const { triggerRef, cancelRef } = useConfirmFocus(confirming);
  const name = saveState.values?.name ?? category.name;
  const description = saveState.values?.description ?? category.description ?? "";
  const isPublished = saveState.values?.isPublished ?? category.isPublished;
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="categoryId" value={category.id} />
        {saveState.status === "saved" ? (
          <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
            {saveState.message ?? "Category saved."}
          </p>
        ) : null}
        {saveState.status === "error" && !saveState.fields ? (
          <ErrorState title="Could not save the category" message={saveState.message} />
        ) : null}
        {saveState.status === "error" && saveState.fields ? (
          <p role="alert" className="text-sm text-red-600">
            {saveState.message ?? "Check the highlighted fields and try again."}
          </p>
        ) : null}
        <Field label="Category name" required error={fieldError(saveState.fields, "name")}>
          <Input name="name" required defaultValue={name} autoComplete="off" />
        </Field>
        <Field
          label="Description"
          hint="Shown under the heading on the public menu."
          error={fieldError(saveState.fields, "description")}
        >
          <Textarea name="description" rows={3} defaultValue={description} />
        </Field>
        <label className="flex min-h-6 items-center gap-2 text-sm text-foreground/80">
          <input
            type="checkbox"
            name="isPublished"
            defaultChecked={isPublished}
            className="h-4 w-4 accent-brand-600"
          />
          Published — visible on the public menu
        </label>
        <FormActions>
          <Button type="submit" loading={savePending}>
            {savePending ? "Saving…" : "Save category"}
          </Button>
        </FormActions>
      </form>
      <section aria-label="Delete category" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Delete category</h2>
        {itemCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            This category holds {itemCount} {itemCount === 1 ? "item" : "items"}. Deleting keeps{" "}
            {itemCount === 1 ? "it" : "them"} on the menu as uncategorised — nothing is deleted
            except the heading.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            This category is empty, so deleting only removes the heading.
          </p>
        )}
        {deleteState.status === "error" ? (
          <ErrorState title="Could not delete the category" message={deleteState.message} />
        ) : null}
        {confirming ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="categoryId" value={category.id} />
            <Button type="submit" variant="danger" loading={deletePending}>
              {deletePending ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
            >
              Keep category
            </Button>
          </form>
        ) : (
          <div>
            <Button
              ref={triggerRef}
              type="button"
              variant="outline"
              onClick={() => setConfirming(true)}
            >
              Delete category…
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
