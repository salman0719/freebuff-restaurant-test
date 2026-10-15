/**
 * Dashboard loading state (Phase 3.1; skeleton extracted in 4.5). Covers
 * `/dashboard` — the restaurant picker — while its session read resolves.
 * The skeleton is shared with the tenant shell's own boundary
 * (`./_components/dashboard-skeleton.tsx`) so both show one shape.
 */
import { DashboardSkeleton } from "./_components/dashboard-skeleton";

export default function DashboardLoading(): React.ReactElement {
  return <DashboardSkeleton />;
}
