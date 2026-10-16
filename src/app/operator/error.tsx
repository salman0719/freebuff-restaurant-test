/**
 * Operator console error state (Phase 6.2). Mirrors the dashboard boundary:
 * catches render and data failures for `/operator` pages with a retry, and
 * says nothing about what broke — the detail belongs in the server log,
 * not in a staff browser.
 */
"use client";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ErrorState } from "@/components/ui/feedback";

export default function OperatorError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  return (
    <Container className="py-8">
      <ErrorState
        title="The operator console could not load"
        message="Something went wrong on our side. No restaurant was changed — try again."
        action={
          <Button type="button" variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
    </Container>
  );
}
