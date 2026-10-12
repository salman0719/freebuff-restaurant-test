/**
 * Login form (Phase 3.1). Client component: owns the `useActionState`
 * round-trip so a rejected email shows inline without losing input.
 */
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { requestMagicLink } from "../actions";
import type { LoginState } from "../login-form";

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
