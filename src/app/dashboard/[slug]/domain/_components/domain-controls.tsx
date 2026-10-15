/**
 * Domain claim controls (Phase 5.2). Client component: three
 * `useActionState` round-trips (record, check, remove) so every outcome
 * is reported honestly — pending is not success, a conflict or failed
 * DNS query is an error, and nothing reports success before the write
 * lands. Removal takes the address away, so it arms a confirm step first
 * (same pattern as unpublish).
 */
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import type { DomainClaim } from "@/lib/domain-claim";
import { clearDomain, submitDomain, verifyDomain, type DomainState } from "../actions";

function fieldError(fields: Record<string, string[]> | undefined, key: string): string | undefined {
  return fields?.[key]?.[0];
}

function StatusMessage({ state }: { state: DomainState }) {
  if (state.status === "error") {
    return state.fields ? (
      <p role="alert" className="text-sm text-red-600">
        {state.message}
      </p>
    ) : (
      <ErrorState title="Domain unchanged" message={state.message} />
    );
  }
  if (state.message) {
    return (
      <p
        role="status"
        className={
          state.status === "verified"
            ? "rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800"
            : "rounded-lg bg-muted px-4 py-3 text-sm text-foreground/80"
        }
      >
        {state.message}
      </p>
    );
  }
  return null;
}

export function DomainControls({ slug, claim }: { slug: string; claim: DomainClaim }) {
  const [submitState, submitAction, submitPending] = useActionState<DomainState, FormData>(
    submitDomain,
    { status: "idle" }
  );
  const [checkState, checkAction, checkPending] = useActionState<DomainState, FormData>(
    verifyDomain,
    { status: "idle" }
  );
  const [removeState, removeAction, removePending] = useActionState<DomainState, FormData>(
    clearDomain,
    { status: "idle" }
  );
  const [confirming, setConfirming] = useState(false);

  const domainInput = (
    <Field
      label="Domain"
      required
      hint="The address visitors will type, e.g. shop.example.com — without https:// or a path."
      error={fieldError(submitState.fields, "domain")}
    >
      <Input
        name="domain"
        required
        defaultValue={claim.domain ?? ""}
        placeholder="shop.example.com"
        autoComplete="url"
        autoCapitalize="none"
        spellCheck={false}
      />
    </Field>
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {claim.status === "none" ? (
        <section aria-label="Record a domain">
          <form action={submitAction} className="flex flex-col gap-4">
            <input type="hidden" name="slug" value={slug} />
            {domainInput}
            <FormActions hint="Recording a claim starts verification — nothing changes on the public site yet.">
              <Button type="submit" loading={submitPending}>
                {submitPending ? "Recording…" : "Record domain"}
              </Button>
            </FormActions>
          </form>
          <StatusMessage state={submitState} />
        </section>
      ) : null}

      {claim.status === "pending" && claim.domain ? (
        <section aria-label="Verification" className="flex flex-col gap-4">
          <div className="rounded-lg border border-border">
            <p className="border-b border-border px-4 py-2 text-sm font-medium text-foreground">
              Add this record at your DNS provider
            </p>
            <dl className="divide-y divide-border text-sm">
              <div className="flex flex-wrap gap-2 px-4 py-3">
                <dt className="w-20 text-muted-foreground">Type</dt>
                <dd>
                  <code>TXT</code>
                </dd>
              </div>
              <div className="flex flex-wrap gap-2 px-4 py-3">
                <dt className="w-20 text-muted-foreground">Name</dt>
                <dd className="break-all">
                  <code>_restaurant-platform.{claim.domain}</code>
                </dd>
              </div>
              <div className="flex flex-wrap gap-2 px-4 py-3">
                <dt className="w-20 text-muted-foreground">Value</dt>
                <dd className="break-all">
                  <code>{claim.verifyToken}</code>
                </dd>
              </div>
            </dl>
          </div>
          <form action={checkAction}>
            <input type="hidden" name="slug" value={slug} />
            <Button type="submit" loading={checkPending}>
              {checkPending ? "Checking…" : "I've added the record — check now"}
            </Button>
          </form>
          <StatusMessage state={checkState} />
        </section>
      ) : null}

      {claim.domain ? (
        <section aria-label="Change or remove" className="flex flex-col gap-4">
          <form action={submitAction} className="flex flex-col gap-4">
            <input type="hidden" name="slug" value={slug} />
            {domainInput}
            <FormActions hint="Submitting a different domain restarts verification with a new record.">
              <Button type="submit" variant="outline" loading={submitPending}>
                {submitPending ? "Updating…" : "Use a different domain"}
              </Button>
            </FormActions>
          </form>
          <StatusMessage state={submitState} />

          {removeState.status === "saved" ? (
            <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
              {removeState.message}
            </p>
          ) : null}
          {removeState.status === "error" ? (
            <ErrorState title="Domain unchanged" message={removeState.message} />
          ) : null}
          {confirming ? (
            <form action={removeAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="slug" value={slug} />
              <Button type="submit" variant="danger" loading={removePending}>
                {removePending ? "Removing…" : "Confirm removal"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Keep domain
              </Button>
            </form>
          ) : (
            <div>
              <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
                Remove domain…
              </Button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
