/**
 * Dashboard loading state (Phase 3.1; layout-matched in Phase B). Covers
 * `/dashboard` and every tenant page beneath it while server data resolves.
 * The skeleton mirrors the overview's shape — header, three stat cards, and
 * a row of actions — so the page does not jump when content arrives.
 */
import { Container } from "@/components/ui/container";
import { Skeleton, Spinner } from "@/components/ui/feedback";

export default function DashboardLoading(): React.ReactElement {
  return (
    <Container>
      <div className="flex flex-col gap-6 py-8">
        <Spinner label="Loading dashboard…" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-64 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    </Container>
  );
}
