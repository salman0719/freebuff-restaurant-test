/**
 * Publish controls (Phase 3.8). Client component: owns the
 * `useActionState` round-trip so persistence failures surface as errors
 * instead of false success, and saves confirm via a `role="status"`
 * message. Publishing is one click; unpublishing takes the public site
 * offline, so it arms a confirm step first.
 */
"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { setPublished, type PublishState } from "../actions";

export function PublishControls({ slug, published }: { slug: string; published: boolean }) {
  const [state, action, pending] = useActionState<PublishState, FormData>(setPublished, {
    status: "idle",
  });
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {state.status === "saved" ? (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {state.message}
        </p>
      ) : null}
      {state.status === "error" ? (
        <ErrorState title="Publishing state unchanged" message={state.message} />
      ) : null}
      {published ? (
        confirming ? (
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="published" value="false" />
            <Button type="submit" variant="danger" loading={pending}>
              {pending ? "Unpublishing…" : "Confirm unpublish"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Keep published
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
              Unpublish site…
            </Button>
            <Link
              href={`/dashboard/${slug}/theme/preview`}
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              Preview site →
            </Link>
          </div>
        )
      ) : (
        <form action={action}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="published" value="true" />
          <div>
            <Button type="submit" loading={pending}>
              {pending ? "Publishing…" : "Publish site"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
