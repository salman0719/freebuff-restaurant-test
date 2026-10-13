/**
 * Category create form (Phase 3.4). Client component: owns the
 * `useActionState` round-trip so rejected creates keep typed input and
 * show field-level errors, and creates confirm via a `role="status"`
 * message. `slug` rides along as a hidden field for context lookup.
 * New categories go last — display order is managed from the list.
 */
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCategory, type CategoryState } from "../actions";

function fieldError(fields: Record<string, string[]> | undefined, key: string): string | undefined {
  return fields?.[key]?.[0];
}

export function CategoryCreateForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<CategoryState, FormData>(createCategory, {
    status: "idle",
  });
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      {state.status === "saved" ? (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {state.message ?? "Category added."}
        </p>
      ) : null}
      {state.status === "error" && !state.fields ? (
        <ErrorState title="Could not add the category" message={state.message} />
      ) : null}
      {state.status === "error" && state.fields ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message ?? "Check the highlighted fields and try again."}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category name" required error={fieldError(state.fields, "name")}>
          <Input
            name="name"
            required
            defaultValue={state.values?.name ?? ""}
            placeholder="Mains"
            autoComplete="off"
          />
        </Field>
        <Field
          label="Description"
          hint="Shown under the heading on the public menu."
          error={fieldError(state.fields, "description")}
        >
          <Textarea name="description" rows={2} defaultValue={state.values?.description ?? ""} />
        </Field>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          {pending ? "Adding…" : "Add category"}
        </Button>
      </div>
    </form>
  );
}
