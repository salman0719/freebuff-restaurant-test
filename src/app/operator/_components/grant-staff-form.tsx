/**
 * Grant-staff form (Phase 4.5). Client component: owns the `useActionState`
 * round-trip so granting someone who has no account, or who is already
 * staff, surfaces instead of appearing to succeed.
 *
 * One field, like the owner form: the operator's only handle on a person is
 * their email address. Unlike the owner grant this never creates the
 * account — staff access goes to someone who already exists, so a typo fails
 * as \"no such person\" rather than inventing a privileged row.
 */
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { grantStaffAction, type ProvisionState } from "../actions";

export function GrantStaffForm() {
  const [state, action, pending] = useActionState<ProvisionState, FormData>(grantStaffAction, {
    status: "idle",
  });
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      {state.status === "saved" ? (
        <p
          role="status"
          className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "error" ? (
        <ErrorState title="Could not grant staff access" message={state.message} />
      ) : null}
      <Field
        label="Staff email"
        required
        error={state.fields?.email?.[0]}
        hint="They must already have an account — ask them to sign in once first. This grants platform-wide access."
      >
        <Input
          type="email"
          name="email"
          required
          placeholder="colleague@example.com"
          autoComplete="off"
        />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          {pending ? "Granting…" : "Grant staff access"}
        </Button>
      </div>
    </form>
  );
}
