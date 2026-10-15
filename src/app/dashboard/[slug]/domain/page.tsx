/**
 * Custom domain page (Phase 5.2). The parent layout already gated the
 * context; the page re-resolves it for its own data load (same
 * `notFound()` on failure — no oracle) and renders the claim's state in
 * plain words: record a domain, publish the TXT proof, check it, and
 * remove it (two-step — removal takes the address away).
 *
 * The page never claims a domain is LIVE: verification proves ownership
 * (5.2); routing and HTTPS are 5.3, so a verified domain still reports
 * that visitors are not sent here yet. That is the same line the
 * operator checklist draws (RECORDED, never live).
 *
 * The sync default export exists so the page's own read — `params`, then
 * the session, then the claim — starts inside a `<Suspense>` boundary:
 * without it Next reports "encountered uncached data" and the client
 * navigation blocks on the data instead of painting the skeleton (the
 * Phase 4.5 sweep).
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { Heading, Text } from "@/components/ui/typography";
import { getDomainClaim } from "@/lib/domain-claim";
import { getTenantContext } from "@/lib/tenant-context";
import { PageSkeleton } from "../../_components/page-skeleton";
import { DomainControls } from "./_components/domain-controls";

type Props = { params: Promise<{ slug: string }> };

export default function DomainPage({ params }: Props): React.ReactElement {
  return (
    <Suspense fallback={<PageSkeleton label="Loading domain…\" />}>
      <DomainView params={params} />
    </Suspense>
  );
}

async function DomainView({ params }: Props): Promise<React.ReactElement> {
  // Request-time before anything else: Auth.js reads random bytes while it
  // builds its CSRF token, and `cacheComponents` treats that as IO, so a
  // prerender pass that reaches `auth()` reports the crypto insight.
  await connection();
  const { slug } = await params;
  const context = await getTenantContext(await auth(), slug);
  if (!context.ok) {
    notFound();
  }
  const claim = await getDomainClaim(context.data);
  if (!claim.ok) {
    notFound();
  }
  const data = claim.data;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1} className="mb-2">
          Domain
        </Heading>
        <Text>
          Give this restaurant its own address. The platform address (based on{" "}
          <code className="rounded bg-muted px-1">{context.data.tenant.slug}</code>) keeps working
          either way — a custom domain is an addition, never a replacement, until you remove it
          here.
        </Text>
      </div>
      {data.domain && data.status === "pending" ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <strong>{data.domain}</strong> is recorded but not verified yet — it does not serve the
          site until your DNS record is seen.
        </div>
      ) : null}
      {data.domain && data.status === "verified" ? (
        <div
          role="status"
          className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          {" "}
          <strong>{data.domain}</strong> is verified — we have confirmed the domain is yours.
          Routing connects to the platform edge automatically; use the status check below to watch
          DNS validation and HTTPS come online. The address stays offline until that check reports
          it live.
        </div>
      ) : null}
      <DomainControls slug={context.data.tenant.slug} claim={data} />
    </div>
  );
}
