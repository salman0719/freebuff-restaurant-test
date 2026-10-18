/**
 * Domain claim controls (Phase 5.2). Client component: three
 * `useActionState` round-trips (record, check, remove) so every outcome
 * is reported honestly — pending is not success, a conflict or failed
 * DNS query is an error, and nothing reports success before the write
 * lands. Removal takes the address away, so it arms a confirm step first
 * (same pattern as unpublish).
 *
 * Message placement is deliberate: phase banners (in the page) confirm
 * the NEW state after a successful write, because a message rendered
 * inside the old phase's section unmounts with it — removal would report
 * nothing, and a stale "recorded" line would outlive the record. So:
 * errors render at the root (they stay until fixed), the check result
 * lives with the check button it belongs to, and the removal confirmation
 * renders in the empty phase where it is the only thing to say.
 */
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirmFocus } from "@/components/ui/confirm-focus";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/feedback";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import type { DomainClaim } from "@/lib/domain-claim";
import {
  checkRouting,
  clearDomain,
  submitDomain,
  verifyDomain,
  type DomainState,
} from "../actions";

function fieldError(fields: Record<string, string[]> | undefined, key: string): string | undefined {
  return fields?.[key]?.[0];
}

function ErrorMessage({ state }: { state: DomainState }) {
  if (state.status !== "error") return null;
  return state.fields ? (
    <p role="alert" className="text-sm text-red-600">
      {state.message}
    </p>
  ) : (
    <ErrorState title="Domain unchanged" message={state.message} />
  );
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
  const [routingState, routingAction, routingPending] = useActionState<DomainState, FormData>(
    checkRouting,
    { status: "idle" }
  );
  const [confirming, setConfirming] = useState(false);
  const { triggerRef, cancelRef } = useConfirmFocus(confirming);

  const routingTone = {
    live: "border-green-300 bg-green-50 text-green-800",
    pending: "border-amber-300 bg-amber-50 text-amber-900",
    detached: "border-border bg-muted text-foreground/80",
  } as const;

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
      {/* Errors persist at the root: they describe what to fix, whatever
          phase the claim is in now. Field errors also show inline. */}
      <ErrorMessage state={submitState} />
      <ErrorMessage state={removeState} />

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
          {/* The confirmation for a removal lands here: the claim is gone,
              so this phase has nothing else to say. */}
          {removeState.status === "saved" ? (
            <p
              role="status"
              className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800"
            >
              {removeState.message}
            </p>
          ) : null}
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
          {/* The check result belongs to the button that produced it. */}
          {checkState.status === "pending" ? (
            <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm text-foreground/80">
              {checkState.message}
            </p>
          ) : null}
          {checkState.status === "verified" ? (
            <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
              {checkState.message}
            </p>
          ) : null}
          <ErrorMessage state={checkState} />
        </section>
      ) : null}

      {claim.status === "verified" ? (
        <section aria-label="Routing" className="flex flex-col gap-4">
          <form action={routingAction}>
            <input type="hidden" name="slug" value={slug} />
            <Button type="submit" variant="outline" loading={routingPending}>
              {routingPending ? "Checking routing…" : "Check routing status"}
            </Button>
          </form>
          {routingState.routing ? (
            <p
              role="status"
              className={`rounded-lg border px-4 py-3 text-sm ${routingTone[routingState.routing.status]}`}
            >
              {routingState.routing.message}
            </p>
          ) : routingState.status === "error" ? (
            <ErrorMessage state={routingState} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Routing connects automatically after verification. This check reads the
              platform&apos;s attach state and probes the address over HTTPS — both can take a few
              minutes after DNS starts pointing here.
            </p>
          )}
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
          {confirming ? (
            <form action={removeAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="slug" value={slug} />
              <Button type="submit" variant="danger" loading={removePending}>
                {removePending ? "Removing…" : "Confirm removal"}
              </Button>
              <Button
                ref={cancelRef}
                type="button"
                variant="outline"
                onClick={() => setConfirming(false)}
              >
                Keep domain
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
                Remove domain…
              </Button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
