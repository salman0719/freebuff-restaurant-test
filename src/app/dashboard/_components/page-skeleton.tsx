/**
 * Page-level loading shape (Phase 4.5 sweep). Each dashboard page renders its
 * own Suspense fallback, because the page's read is the one Next validates:
 * a page that awaits its data outside a boundary reports "encountered uncached
 * data" on every client navigation, and the navigation blocks instead of
 * painting. One shared shape keeps those fallbacks from drifting.
 *
 * No `Container` here: pages render inside the tenant shell's container, so a
 * second one would double the gutter. Bars only — a title, a lead line, and
 * a few content blocks, close enough that arriving content barely moves.
 */
import { Skeleton, Spinner } from "@/components/ui/feedback";

export function PageSkeleton({
  label = "Loading…",
  blocks = 3,
}: {
  label?: string;
  blocks?: number;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <Spinner label={label} />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-64 max-w-full" />
      </div>
      <div className="flex max-w-3xl flex-col gap-3">
        {Array.from({ length: blocks }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
