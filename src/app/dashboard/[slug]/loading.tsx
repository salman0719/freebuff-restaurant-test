/* Experiment: does a segment-level loading boundary clear the insight? */
import { DashboardSkeleton } from "../_components/dashboard-skeleton";

export default function TenantLoading(): React.ReactElement {
  return <DashboardSkeleton label="Loading restaurant…" />;
}
