/**
 * Invite-an-owner form (Phase 4.2). Client component: owns the
 * `useActionState` round-trip so a duplicate grant or a bad address surfaces
 * instead of appearing to succeed.
 *
 * One field, because the operator's only handle on a person is their email
 * address: whether that account already exists is the server's business, and
 * the reply says which happened.
 */
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { inviteOwnerAction, type ProvisionState } from "../actions";

export function InviteOwnerForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<ProvisionState, FormData>(inviteOwnerAction, {
    status: "idle",
  });
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      {state.status === "saved" ? (
        <p
          role="status"
          className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "error" ? (
        <ErrorState title="Could not grant access" message={state.message} />
      ) : null}
      <Field
        label="Owner's email"
        required
        error={state.fields?.email?.[0]}
        hint="They sign in with a magic link to this address — no password to set."
      >
        <Input
          type="email"
          name="email"
          required
          placeholder="owner@example.com"
          autoComplete="off"
        />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          {pending ? "Granting…" : "Grant owner access"}
        </Button>
      </div>
    </form>
  );
}
