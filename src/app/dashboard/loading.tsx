/**
 * Dashboard loading state (Phase 3.1). Covers `/dashboard` and every
 * tenant page beneath it while server data resolves.
 */
import { Container } from "@/components/ui/container";
import { Skeleton, Spinner } from "@/components/ui/feedback";

export default function DashboardLoading(): React.ReactElement {
  return (
    <Container className="flex flex-col gap-4 py-8">
      <Spinner label="Loading dashboard…" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </Container>
  );
}
