/**
 * Item create form (Phase 3.5). Client component: owns the
 * `useActionState` round-trip so rejected creates keep typed input and
 * show field-level errors, and creates confirm via a `role="status"`
 * message. Price is entered in dollars; new items go last and start
 * published and available.
 */
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MenuCategory } from "@/lib/restaurant";
import { createItem, type ItemState } from "../actions";

function fieldError(fields: Record<string, string[]> | undefined, key: string): string | undefined {
  // The form posts dollars as `price`; failures surface under `priceCents`.
  const mapped = key === "price" ? "priceCents" : key;
  return fields?.[mapped]?.[0];
}

export function ItemCreateForm({ slug, categories }: { slug: string; categories: MenuCategory[] }) {
  const [state, action, pending] = useActionState<ItemState, FormData>(createItem, {
    status: "idle",
  });
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      {state.status === "saved" ? (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {state.message ?? "Item added."}
        </p>
      ) : null}
      {state.status === "error" && !state.fields ? (
        <ErrorState title="Could not add the item" message={state.message} />
      ) : null}
      {state.status === "error" && state.fields ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message ?? "Check the highlighted fields and try again."}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name" required error={fieldError(state.fields, "name")}>
          <Input
            name="name"
            required
            defaultValue={state.values?.name ?? ""}
            placeholder="Margherita pizza"
            autoComplete="off"
          />
        </Field>
        <Field
          label="Price"
          required
          hint="Dollars and cents, e.g. 12.99."
          error={fieldError(state.fields, "price")}
        >
          <Input
            name="price"
            required
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={state.values?.price ?? ""}
            placeholder="12.99"
          />
        </Field>
      </div>
      <Field label="Description" error={fieldError(state.fields, "description")}>
        <Textarea name="description" rows={2} defaultValue={state.values?.description ?? ""} />
      </Field>
      <Field
        label="Category"
        hint={
          categories.length === 0
            ? "No categories yet — the item will be uncategorised."
            : undefined
        }
        error={fieldError(state.fields, "categoryId")}
      >
        <Select name="categoryId" defaultValue={state.values?.categoryId ?? ""}>
          <option value="">Uncategorised</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          {pending ? "Adding…" : "Add item"}
        </Button>
      </div>
    </form>
  );
}
