/**
 * Operator loading state (Phase 3.1). Doubles as the Suspense
 * boundary Cache Components requires: the page reads the session
 * (request data), so the shell prerenders and content streams in.
 */
import { Container } from "@/components/ui/container";
import { Skeleton, Spinner } from "@/components/ui/feedback";

export default function OperatorLoading(): React.ReactElement {
  return (
    <Container className="flex flex-col gap-4 py-8">
      <Spinner label="Loading operator console…" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
    </Container>
  );
}
