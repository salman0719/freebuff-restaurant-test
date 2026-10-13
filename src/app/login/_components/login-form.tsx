/**
 * Login form (Phase 3.1, skeleton in 3.9). Client component: owns the
 * `useActionState` round-trip so a rejected email shows inline without
 * losing input.
 *
 * `LoginFormSkeleton` is the Suspense fallback on the login page. It must
 * stay non-interactive (disabled inputs, no labels, no action): an earlier
 * revision rendered a second live `LoginForm` as the fallback, and the
 * stale prerendered copy could linger beside the real form — its submit
 * button looked alive but posted a dead server-action reference, so
 * sign-in silently did nothing (found by the 3.9 E2E). Exactly one live
 * form may exist; the skeleton is layout only.
 */
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/feedback";
import { requestMagicLink } from "../actions";
import type { LoginState } from "../login-form";

/**
 * Non-interactive loading placeholder for the login page's Suspense
 * boundary. Deliberately inert (no form, no labels, no buttons) so it
 * can never shadow the real form — see the module docstring.
 */
export function LoginFormSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

export function LoginForm({ next, initialEmail }: { next: string; initialEmail?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestMagicLink, {
    email: initialEmail,
  });
  return (
    <form action={action} className="flex flex-col gap-4" noValidate={false}>
      <input type="hidden" name="next" value={next} />
      <Field label="Email address" required htmlFor="login-email">
        <Input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email}
          placeholder="you@example.com"
        />
      </Field>
      {state.error ? <ErrorState title="Could not send the link" message={state.error} /> : null}
      <Button type="submit" loading={pending} fullWidth>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
