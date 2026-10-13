/**
 * Opening-hours editor (Phase 3.3). The parent layout already
 * gated the context; the page re-resolves it for its own data load
 * (same `notFound()` on failure — no oracle) and hands the stored
 * week to the form as initial values. Days with no row yet render as
 * closed — matching the public `HoursList`, which renders exactly the
 * stored rows and shows "Closed" for closed days.
 */
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantHours } from "@/lib/tenant-data";
import { HoursForm } from "./_components/hours-form";

export default async function HoursPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const context = await getTenantContext(await auth(), slug);
  if (!context.ok) {
    notFound();
  }
  const hours = await getTenantHours(context.data);
  if (!hours.ok) {
    notFound();
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1} className="mb-2">
          Opening hours
        </Heading>
        <Text>Shown on the public site exactly as entered here.</Text>
      </div>
      <HoursForm slug={context.data.tenant.slug} hours={hours.data} />
    </div>
  );
}
