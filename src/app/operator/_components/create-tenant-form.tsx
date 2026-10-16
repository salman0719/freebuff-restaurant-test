/**
 * Create-restaurant form (Phase 4.2). Client component: owns the
 * `useActionState` round-trip so a rejected address or name shows up as a
 * field error instead of a silent no-op, and a successful create links
 * straight to the next step — inviting the owner.
 *
 * Theme options arrive as props from the server page rather than being
 * imported from `@/themes/registry`, so the client bundle never pulls in the
 * theme components (the same reason `theme-options-form` receives its
 * accents as props).
 */
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Text } from "@/components/ui/typography";
import { createTenantAction, type ProvisionState } from "../actions";

export interface ThemeChoice {
  id: string;
  label: string;
}

export function CreateTenantForm({ themes }: { themes: ThemeChoice[] }) {
  const [state, action, pending] = useActionState<ProvisionState, FormData>(createTenantAction, {
    status: "idle",
  });
  return (
    <Card className="max-w-2xl">
      <CardTitle>New restaurant</CardTitle>
      <CardContent>
        <form action={action} className="flex flex-col gap-5">
          {state.status === "saved" ? (
            <div
              role="status"
              className="flex flex-col items-start gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300"
            >
              <p>{state.message}</p>
              {state.slug ? (
                <Link href={`/operator/tenants/${state.slug}`} className="font-medium underline">
                  Assign its owner →
                </Link>
              ) : null}
            </div>
          ) : null}
          {state.status === "error" ? (
            <ErrorState title="Could not create the restaurant" message={state.message} />
          ) : null}

          <Field
            label="Address"
            required
            hint="Lowercase letters, digits, and single hyphens. This becomes the restaurant's URL and cannot be changed later."
            error={state.fields?.slug?.[0]}
          >
            <Input name="slug" required placeholder="marios-pizza" autoComplete="off" />
          </Field>

          <Field label="Restaurant name" required error={state.fields?.name?.[0]}>
            <Input name="name" required placeholder="Mario's Pizza" autoComplete="off" />
          </Field>

          <Field label="Default theme" hint="The owner can change this later from their dashboard.">
            <Select name="theme" defaultValue="cafe">
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex min-h-6 items-center gap-2 text-sm text-foreground/80">
            <input type="checkbox" name="published" className="size-4 accent-brand-600" />
            Publish immediately
          </label>
          <Text size="sm" muted>
            Leave this off and the site stays a draft — visible only to its members until they
            publish it themselves. A new restaurant has no menu, hours, or owner yet either way.
          </Text>

          <FormActions hint="Creates the restaurant and its profile.">
            <Button type="submit" loading={pending}>
              {pending ? "Creating…" : "Create restaurant"}
            </Button>
          </FormActions>
        </form>
      </CardContent>
    </Card>
  );
}
