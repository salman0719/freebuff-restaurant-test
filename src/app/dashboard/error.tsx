/**
 * Dashboard error state (Phase 3.1). Client boundary: catches render
 * and data failures for `/dashboard` and tenant pages, with a retry.
 */
"use client";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ErrorState } from "@/components/ui/feedback";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  return (
    <Container className="py-8">
      <ErrorState
        title="The dashboard could not load"
        message="Something went wrong on our side. Your restaurant content is safe — try again."
        action={
          <Button type="button" variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
    </Container>
  );
}
