/**
 * Dashboard loading shape (Phase 3.1; shared in 4.5). Both users of it need
 * the SAME skeleton: `loading.tsx` covers the restaurant picker at
 * `/dashboard`, and the tenant shell's Suspense boundary covers every page
 * beneath it while its membership-gated read resolves. Two copies would drift
 * the moment one is adjusted, and the mismatch shows as a jump.
 *
 * The shape mirrors the overview — header, three stat cards, and a row of
 * actions — so content arriving does not move the page under the reader.
 */
import { Container } from "@/components/ui/container";
import { Skeleton, Spinner } from "@/components/ui/feedback";

export function DashboardSkeleton({ label = "Loading dashboard…" }: { label?: string }) {
  return (
    <Container>
      <div className="flex flex-col gap-6 py-8">
        <Spinner label={label} />
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
