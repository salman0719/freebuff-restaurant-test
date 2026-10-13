/**
 * Profile editor form (Phase 3.2, logo in 3.6). Client component: owns the
 * `useActionState` round-trip so rejected saves keep typed input and
 * show field-level errors, and saves confirm via a `role="status"`
 * message. `slug` rides along as a hidden field for context lookup.
 * A selected logo uploads with the save (JPEG/PNG/WebP, at most 2 MB);
 * file inputs cannot be re-echoed, so a rejected save asks to reselect.
 */
"use client";

import { useActionState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { imageUrlForKey } from "@/lib/image-url";
import type { RestaurantProfile } from "@/lib/restaurant";
import { saveProfile, type ProfileState } from "../actions";

function fieldError(fields: Record<string, string[]> | undefined, key: string): string | undefined {
  return fields?.[key]?.[0];
}

export function ProfileForm({
  slug,
  profile,
}: {
  slug: string;
  profile: RestaurantProfile | null;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {
    status: "idle",
  });
  const value = (key: keyof NonNullable<ProfileState["values"]>): string => {
    if (state.values?.[key] !== undefined) return state.values[key] as string;
    const stored = profile?.[key as keyof RestaurantProfile];
    return typeof stored === "string" ? stored : "";
  };
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      {state.status === "saved" ? (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {state.message ?? "Profile saved."}
        </p>
      ) : null}
      {state.status === "error" && !state.fields ? (
        <ErrorState title="Could not save the profile" message={state.message} />
      ) : null}
      {state.status === "error" && state.fields ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message ?? "Check the highlighted fields and try again."}
        </p>
      ) : null}
      <Field label="Restaurant name" required error={fieldError(state.fields, "name")}>
        <Input name="name" required defaultValue={value("name")} autoComplete="organization" />
      </Field>
      <Field
        label="Logo"
        hint="JPEG, PNG, or WebP, at most 2 MB. Shown at the top of the public site."
        error={fieldError(state.fields, "image")}
      >
        {profile?.logoImageKey ? (
          <Image
            src={imageUrlForKey(profile.logoImageKey)}
            alt="Current restaurant logo"
            width={96}
            height={96}
            className="mb-2 rounded-lg border border-zinc-200 object-contain dark:border-zinc-800"
          />
        ) : null}
        <Input name="logo" type="file" accept="image/jpeg,image/png,image/webp" />
        {fieldError(state.fields, "image") ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Select the file again — browsers don&apos;t keep it after a failed save.
          </p>
        ) : null}
      </Field>
      <Field
        label="Description"
        hint="Shown on the public site."
        error={fieldError(state.fields, "description")}
      >
        <Textarea name="description" rows={4} defaultValue={value("description")} />
      </Field>
      <Field label="Phone" error={fieldError(state.fields, "phone")}>
        <Input name="phone" type="tel" defaultValue={value("phone")} autoComplete="tel" />
      </Field>
      <Field label="Email" error={fieldError(state.fields, "email")}>
        <Input name="email" type="email" defaultValue={value("email")} autoComplete="email" />
      </Field>
      <Field label="Address line 1" error={fieldError(state.fields, "addressLine1")}>
        <Input
          name="addressLine1"
          defaultValue={value("addressLine1")}
          autoComplete="address-line1"
        />
      </Field>
      <Field label="Address line 2" error={fieldError(state.fields, "addressLine2")}>
        <Input
          name="addressLine2"
          defaultValue={value("addressLine2")}
          autoComplete="address-line2"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City" error={fieldError(state.fields, "city")}>
          <Input name="city" defaultValue={value("city")} autoComplete="address-level2" />
        </Field>
        <Field label="Postal code" error={fieldError(state.fields, "postalCode")}>
          <Input name="postalCode" defaultValue={value("postalCode")} autoComplete="postal-code" />
        </Field>
        <Field label="Country" error={fieldError(state.fields, "country")}>
          <Input name="country" defaultValue={value("country")} autoComplete="country-name" />
        </Field>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
