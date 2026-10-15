/**
 * One restaurant, from the operator's side (Phase 4.2, checklist in 4.3).
 *
 * Shows what the platform knows about the tenant — its address, theme, and
 * whether it is live — the full setup checklist, the one action an operator
 * takes here (granting someone owner access), and the record of who has
 * already done what to this restaurant (4.4).
 *
 * It deliberately does NOT link into the owner's dashboard. Operators are not
 * members of the restaurants they provision, so there is no dashboard to open
 * until that access model is decided (4.4) — which is also why the owner step
 * below still means something.
 *
 * Gated by `requireOperatorPage`; an unknown slug gets the same not-found page
 * as anywhere else.
 *
 * The body sits behind its own `<Suspense>` boundary. The route's address is
 * URL data, so the page it selects cannot be part of the App Shell that every
 * link to `/operator/tenants/*` navigates into; without the boundary the whole
 * route blocks on `params` and the session read (Next logs an
 * "encountered uncached data" insight every time an operator clicks through).
 * With it, navigation paints the shape below immediately and the restaurant
 * streams in.
 */
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Container, Section, Stack } from "@/components/ui/container";
import { Skeleton, Spinner } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Heading, Text } from "@/components/ui/typography";
import { describeAuditEvent, formatAuditTime, listTenantActivity } from "@/lib/audit";
import { requireOperatorPage } from "@/lib/operator-access";
import { getTenantSetup } from "@/lib/operator-tenants";
import { outstandingOnboardingSteps } from "@/lib/onboarding";
import { InviteOwnerForm } from "../../_components/invite-owner-form";

export default function OperatorTenantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): React.ReactElement {
  return (
    <Suspense fallback={<TenantSetupFallback />}>
      <TenantSetup params={params} />
    </Suspense>
  );
}

/**
 * The loading state for one restaurant, shaped like the page it stands in for
 * — header, status badges, checklist — so arriving content does not move the
 * page under the operator's cursor.
 */
function TenantSetupFallback(): React.ReactElement {
  return (
    <Container className="py-8">
      <Section>
        <Spinner label="Loading restaurant…" />
        <div className="mt-4 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-14 w-full max-w-2xl" />
            <Skeleton className="h-14 w-full max-w-2xl" />
            <Skeleton className="h-14 w-full max-w-2xl" />
          </div>
        </div>
      </Section>
    </Container>
  );
}

async function TenantSetup({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  // Request-time before the gate: Auth.js reads random bytes while it builds
  // its CSRF token, which `cacheComponents` treats as IO, so a prerender pass
  // that reaches `auth()` reports the unstable-value insight for this route.
  await connection();
  const { slug } = await params;
  const staff = requireOperatorPage(await auth());
  const result = await getTenantSetup(staff, slug);
  // A non-staff caller is already gone — `requireOperatorPage` gives them the
  // same not-found page as an unknown slug, and an unknown slug is that page
  // too. It streams in behind the boundary above, so the response itself is a
  // 200 shell rather than a 404; the operator sees the not-found page either
  // way, and 4.1's "do not confirm the console exists" property is what the
  // page says, not the status code.
  if (!result.ok || !result.data) {
    notFound();
  }
  const tenant = result.data;
  const outstanding = outstandingOnboardingSteps(tenant.steps);
  // The audit read re-checks the staff role itself; a refusal is not reachable
  // through this page, so an empty history is the honest fallback (an absent
  // trail is also what a restaurant created before 4.4 actually has).
  const recorded = await listTenantActivity(staff, tenant.id);
  const activity = recorded.ok ? recorded.data : [];
  return (
    <Container className="py-8">
      <Section>
        <PageHeader
          eyebrow="Platform"
          title={tenant.name}
          description={`/${tenant.slug}`}
          className="mb-6"
          actions={
            <Link href="/operator" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              ← Console
            </Link>
          }
        />
        <Stack className="max-w-2xl">
          {/* Grouped and named so the three status badges read as one summary,
              and so a caller can address the row rather than each badge. */}
          <div
            role="group"
            aria-label="Restaurant status"
            className="flex flex-wrap items-center gap-2"
          >
            <Badge tone={tenant.published ? "success" : "warning"}>
              {tenant.published ? "Published" : "Draft"}
            </Badge>
            <Badge tone="neutral">{tenant.themeLabel} theme</Badge>
            {tenant.customDomain ? (
              <Badge tone="brand">{tenant.customDomain}</Badge>
            ) : (
              <Badge tone="neutral">Platform address only</Badge>
            )}
          </div>

          <section aria-label="Setup status">
            <Heading level={2} className="mb-1">
              Setup
            </Heading>
            <Text size="sm" muted>
              {outstanding.length === 0
                ? "Nothing required is outstanding — this restaurant is ready for customers."
                : `${outstanding.length} required ${outstanding.length === 1 ? "step" : "steps"} still outstanding.`}
            </Text>
            <ul className="mt-3 flex flex-col gap-2">
              {tenant.steps.map((step) => (
                <li
                  key={step.key}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border px-4 py-3"
                >
                  <p className="text-sm text-foreground">
                    <span aria-hidden="true">{step.met ? "✓ " : "○ "}</span>
                    {step.label}
                    {step.required ? null : (
                      <span className="text-muted-foreground"> (optional)</span>
                    )}
                    <span className="sr-only">{step.met ? " — done" : " — outstanding"}</span>
                  </p>
                  <Text size="sm" muted>
                    {step.detail}
                  </Text>
                </li>
              ))}
            </ul>
          </section>

          <Card>
            <CardTitle>Owner access</CardTitle>
            <CardContent>
              <Text size="sm" muted>
                Only a membership grants access to this restaurant, and an operator is not a member
                of the restaurants they create — so a restaurant with no owner here is one nobody
                can open yet.
              </Text>
              <div className="mt-2">
                <InviteOwnerForm slug={tenant.slug} />
              </div>
            </CardContent>
          </Card>

          {/* The trail is the answer to the question the tenant rows cannot
              answer: who put this here. Scoped to platform staff — it is a
              record of staff acts, not something an owner is shown. */}
          <section aria-label="Activity">
            <Heading level={2} className="mb-1">
              Activity
            </Heading>
            <Text size="sm" muted>
              Platform actions on this restaurant, newest first.
            </Text>
            {activity.length === 0 ? (
              <Text size="sm" muted className="mt-3">
                Nothing recorded yet. This restaurant predates platform record-keeping, or was set
                up before the act was logged.
              </Text>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {activity.map((event) => {
                  const described = describeAuditEvent(event);
                  return (
                    <li
                      key={event.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{described.label}</p>
                        <Text size="sm" muted>
                          {described.detail}
                        </Text>
                      </div>
                      <Text size="sm" muted>
                        <time dateTime={event.createdAt.toISOString()}>
                          {formatAuditTime(event.createdAt)}
                        </time>
                        <span className="sr-only"> by </span>
                        <span aria-hidden="true"> · </span>
                        {event.actorEmail ?? `staff ${event.actorUserId.slice(0, 8)}`}
                      </Text>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Text size="sm" muted>
            Everything else is the owner&apos;s to finish, from their own dashboard. Platform
            addresses are in place from the moment a restaurant exists; a custom domain is a later
            step and is not required for the site to work.
          </Text>
        </Stack>
      </Section>
    </Container>
  );
}
