/**
 * Opening-hours editor (Phase 3.3). The parent layout already
 * gated the context; the page re-resolves it for its own data load
 * (same `notFound()` on failure — no oracle) and hands the stored
 * week to the form as initial values. Days with no row yet render as
 * closed — matching the public `HoursList`, which renders exactly the
 * stored rows and shows "Closed" for closed days.
 *
 * The sync default export exists so the page's own read — `params`, then the
 * session, then the week — starts inside a `<Suspense>` boundary: without it
 * Next reports "encountered uncached data" and the client navigation blocks
 * on the data instead of painting the skeleton (Phase 4.5 sweep).
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantHours } from "@/lib/tenant-data";
import { PageSkeleton } from "../../_components/page-skeleton";
import { HoursForm } from "./_components/hours-form";

type Props = { params: Promise<{ slug: string }> };

export default function HoursPage({ params }: Props): React.ReactElement {
  return (
    <Suspense fallback={<PageSkeleton label="Loading opening hours…" />}>
      <HoursEditor params={params} />
    </Suspense>
  );
}

async function HoursEditor({ params }: Props): Promise<React.ReactElement> {
  // Request-time before anything else: Auth.js reads random bytes while it
  // builds its CSRF token, and `cacheComponents` treats that as IO — a
  // prerender pass that reaches `auth()` reports the crypto insight otherwise.
  await connection();
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
