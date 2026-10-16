/**
 * Root segment error state (Phase 6.2). Catches render and data failures
 * for the public restaurant page — in particular a database outage, which
 * must read as "try again" and never as "not published" (the not-found
 * page's copy would be a lie in that case).
 *
 * Unlike `global-error.tsx` this renders *inside* the root layout, so it
 * can patch a streamed Suspense hole on a resume failure. Copy stays
 * generic: the detail belongs in the server log, not a visitor's browser.
 */
"use client";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ErrorState } from "@/components/ui/feedback";

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  return (
    <Container className="py-8">
      <ErrorState
        title="This restaurant site is temporarily unavailable"
        message="Something went wrong on our side — this is not about the address you typed. Please try again shortly."
        action={
          <Button type="button" variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
    </Container>
  );
}
