/**
 * Item edit form (Phase 3.5). Client component: owns two
 * `useActionState` round-trips — saving (keeps typed input on rejection,
 * confirms via `role="status"`) and deletion (two-step confirm; items are
 * leaves so deletion is immediate, success redirects to the list from the
 * server). Price is entered in dollars and parsed to cents by the form
 * mapping; photos arrive with 3.6 uploads.
 */
"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useConfirmFocus } from "@/components/ui/confirm-focus";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { imageUrlForKey } from "@/lib/image-url";
import type { MenuCategory, MenuItem } from "@/lib/restaurant";
import { formatPrice } from "@/themes/format";
import { deleteItem, saveItem, type ItemState } from "../../actions";

function fieldError(fields: Record<string, string[]> | undefined, key: string): string | undefined {
  // The form posts dollars as `price`; failures surface under `priceCents`.
  const mapped = key === "price" ? "priceCents" : key;
  return fields?.[mapped]?.[0];
}

export function ItemEditForm({
  slug,
  item,
  categories,
}: {
  slug: string;
  item: MenuItem;
  categories: MenuCategory[];
}) {
  const [saveState, saveAction, savePending] = useActionState<ItemState, FormData>(saveItem, {
    status: "idle",
  });
  const [deleteState, deleteAction, deletePending] = useActionState<ItemState, FormData>(
    deleteItem,
    { status: "idle" }
  );
  const [confirming, setConfirming] = useState(false);
  const { triggerRef, cancelRef } = useConfirmFocus(confirming);
  const name = saveState.values?.name ?? item.name;
  const description = saveState.values?.description ?? item.description ?? "";
  const price = saveState.values?.price ?? formatPrice(item.priceCents);
  const categoryId = saveState.values?.categoryId ?? item.categoryId ?? "";
  const isPublished = saveState.values?.isPublished ?? item.isPublished;
  const isAvailable = saveState.values?.isAvailable ?? item.isAvailable;
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="itemId" value={item.id} />
        {saveState.status === "saved" ? (
          <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
            {saveState.message ?? "Item saved."}
          </p>
        ) : null}
        {saveState.status === "error" && !saveState.fields ? (
          <ErrorState title="Could not save the item" message={saveState.message} />
        ) : null}
        {saveState.status === "error" && saveState.fields ? (
          <p role="alert" className="text-sm text-red-600">
            {saveState.message ?? "Check the highlighted fields and try again."}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item name" required error={fieldError(saveState.fields, "name")}>
            <Input name="name" required defaultValue={name} autoComplete="off" />
          </Field>
          <Field
            label="Price"
            required
            hint="Dollars and cents, e.g. 12.99."
            error={fieldError(saveState.fields, "price")}
          >
            <Input
              name="price"
              required
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={price}
            />
          </Field>
        </div>
        <Field label="Description" error={fieldError(saveState.fields, "description")}>
          <Textarea name="description" rows={3} defaultValue={description} />
        </Field>
        <Field label="Category" error={fieldError(saveState.fields, "categoryId")}>
          <Select name="categoryId" defaultValue={categoryId}>
            <option value="">Uncategorised</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Photo"
          hint="JPEG, PNG, or WebP, at most 2 MB. Shown beside the item on the public menu."
          error={fieldError(saveState.fields, "image")}
        >
          {item.imageKey ? (
            <Image
              src={imageUrlForKey(item.imageKey)}
              alt=""
              width={128}
              height={128}
              className="mb-2 rounded-lg border border-border object-cover"
            />
          ) : null}
          <Input name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
          {item.imageKey ? (
            <label className="mt-2 flex min-h-6 items-center gap-2 text-sm text-foreground/80">
              <input type="checkbox" name="removePhoto" className="h-4 w-4 accent-brand-600" />
              Remove the current photo
            </label>
          ) : null}
          {fieldError(saveState.fields, "image") ? (
            <p className="text-sm text-muted-foreground">
              Select the file again — browsers don&apos;t keep it after a failed save.
            </p>
          ) : null}
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
        <label className="flex min-h-6 items-center gap-2 text-sm text-foreground/80">
          <input
            type="checkbox"
            name="isAvailable"
            defaultChecked={isAvailable}
            className="h-4 w-4 accent-brand-600"
          />
          Available — shown as available on the public menu
        </label>
        <FormActions>
          <Button type="submit" loading={savePending}>
            {savePending ? "Saving…" : "Save item"}
          </Button>
        </FormActions>
      </form>
      <section aria-label="Delete item" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Delete item</h2>
        <p className="text-sm text-muted-foreground">
          Deleting removes “{item.name}” from the menu immediately. Nothing else depends on it.
        </p>
        {deleteState.status === "error" ? (
          <ErrorState title="Could not delete the item" message={deleteState.message} />
        ) : null}
        {confirming ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="itemId" value={item.id} />
            <Button type="submit" variant="danger" loading={deletePending}>
              {deletePending ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
            >
              Keep item
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
              Delete item…
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
