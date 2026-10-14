/**
 * Operator console (Phase 4.3). Lists every restaurant with its setup status,
 * newest first, so an operator can see at a glance which ones still need work
 * and who to nudge.
 *
 * The gaps shown here are the BLOCKING ones — the steps a visitor would notice
 * as missing. Which steps those are is decided in `lib/onboarding.ts`, not
 * here, so this summary and the full checklist on each restaurant can never
 * disagree about what "needs attention" means. An unset custom domain is
 * deliberately not one of them: the platform address works, and custom
 * domains are Phase 5.
 *
 * Access is decided by `requireOperatorPage` and nothing else. The data reads
 * re-check the same role themselves, and hand back setup facts and recorded
 * acts — never a restaurant's menu, hours, or contact details.
 *
 * The platform-wide activity feed at the bottom (4.4) is the only view of the
 * trail that spans restaurants, and the only one that can show an act whose
 * restaurant no longer exists — a deleted restaurant has no page left for its
 * history to appear on. It is deliberately the SECOND thing on the page: the
 * console's job is what still needs doing, and the feed is the record of what
 * was done.
 */
import Link from "next/link";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Container, Section } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { Text } from "@/components/ui/typography";
import {
  activitySubject,
  describeAuditEvent,
  formatAuditTime,
  listRecentActivity,
  type RecentActivityEntry,
} from "@/lib/audit";
import { requireOperatorPage } from "@/lib/operator-access";
import { listTenantSetups, type OperatorTenantSetup } from "@/lib/operator-tenants";
import { outstandingOnboardingSteps } from "@/lib/onboarding";

/**
 * One line of the platform feed: what happened, to which restaurant, and by
 * whom. The restaurant is a link when it still exists, and plain text when it
 * does not — a deleted restaurant's record is the one thing this view shows
 * that no restaurant page can.
 */
function ActivityLine({ entry }: { entry: RecentActivityEntry }): React.ReactElement {
  const described = describeAuditEvent(entry);
  const subject = activitySubject(entry);
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-sm text-foreground">
          {described.label}
          {subject ? (
            entry.tenantId ? (
              <>
                {" · "}
                <Link href={`/operator/tenants/${entry.tenantSlug}`} className="hover:underline">
                  {subject}
                </Link>
              </>
            ) : (
              <span className="text-muted-foreground">
                {" · "}
                {subject}
                <span className="sr-only"> (this restaurant no longer exists)</span>
              </span>
            )
          ) : null}
        </p>
        <Text size="sm" muted>
          {described.detail}
        </Text>
      </div>
      <Text size="sm" muted>
        <time dateTime={entry.createdAt.toISOString()}>{formatAuditTime(entry.createdAt)}</time>
        <span className="sr-only"> by </span>
        <span aria-hidden="true"> · </span>
        {entry.actorEmail ?? `staff ${entry.actorUserId.slice(0, 8)}`}
      </Text>
    </li>
  );
}

/** The blocking gaps, as a sentence an operator can act on. */
function outstandingLabel(setup: OperatorTenantSetup): string {
  const outstanding = outstandingOnboardingSteps(setup.steps);
  if (outstanding.length === 0) {
    return "Nothing outstanding";
  }
  return `Needs ${outstanding.map((step) => step.label.toLowerCase()).join(", ")}`;
}

export default async function OperatorPage(): Promise<React.ReactElement> {
  // Throws (redirect) or renders the not-found page for everyone else.
  const staff = requireOperatorPage(await auth());
  const listed = await listTenantSetups(staff);
  // The read re-checks the role itself; a refusal here is not reachable through
  // this page, so an empty list is the honest fallback for anything else.
  const tenants = listed.ok ? listed.data : [];
  // Same gate, same fallback: an empty feed is what a platform with no
  // recorded acts honestly has.
  const recent = await listRecentActivity(staff);
  const activity = recent.ok ? recent.data : [];
  const live = tenants.filter((tenant) => tenant.published).length;
  const needingWork = tenants.filter(
    (tenant) => outstandingOnboardingSteps(tenant.steps).length > 0
  ).length;
  return (
    <Container className="py-8">
      <Section>
        <PageHeader
          eyebrow="Platform"
          title="Operator console"
          description="Every restaurant on the platform, with what it still needs."
          className="mb-6"
          actions={
            <Link href="/operator/tenants/new" className={buttonClasses({ size: "sm" })}>
              New restaurant
            </Link>
          }
        />
        {tenants.length === 0 ? (
          <EmptyState
            title="No restaurants yet"
            description="Set one up, then invite the person who will run it."
            action={
              <Link href="/operator/tenants/new" className={buttonClasses({ size: "sm" })}>
                New restaurant
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            <ul className="grid gap-4 sm:grid-cols-3">
              <li>
                <Stat label="Restaurants" value={tenants.length} />
              </li>
              <li>
                <Stat label="Published" value={live} hint={`${tenants.length - live} in draft`} />
              </li>
              <li>
                <Stat
                  label="Needs attention"
                  value={needingWork}
                  hint={needingWork === 0 ? "All set" : "Missing required setup"}
                />
              </li>
            </ul>
            <ul className="flex flex-col gap-4">
              {tenants.map((tenant) => (
                <li key={tenant.slug}>
                  <Card interactive>
                    <CardContent className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/operator/tenants/${tenant.slug}`}
                            className="hover:underline"
                          >
                            {tenant.name}
                          </Link>
                          <Badge tone={tenant.published ? "success" : "warning"}>
                            {tenant.published ? "Published" : "Draft"}
                          </Badge>
                          <Badge tone="neutral">
                            {tenant.summary.met}/{tenant.summary.total} set
                          </Badge>
                        </CardTitle>
                        <Text size="sm" muted className="mt-1">
                          /{tenant.slug} · {tenant.themeLabel} theme
                        </Text>
                        <Text size="sm" className="mt-1">
                          {outstandingLabel(tenant)}
                        </Text>
                      </div>
                      <Link
                        href={`/operator/tenants/${tenant.slug}`}
                        className={buttonClasses({ variant: "outline", size: "sm" })}
                      >
                        Review →
                      </Link>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Rendered only when there is something to show: a brand-new platform
            has no history, and an empty feed would be a box that says nothing
            where the rest of the page already explains the state. */}
        {activity.length > 0 ? (
          <section aria-label="Recent activity" className="mt-8">
            <Card>
              <CardTitle>Recent activity</CardTitle>
              <Text size="sm" muted className="mt-1">
                What platform staff have done, across every restaurant, newest first.
              </Text>
              <ul className="mt-3 flex flex-col gap-3">
                {activity.map((entry) => (
                  <ActivityLine key={entry.id} entry={entry} />
                ))}
              </ul>
            </Card>
          </section>
        ) : null}
      </Section>
    </Container>
  );
}
