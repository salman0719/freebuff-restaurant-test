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
 * Access is decided by `requireOperatorPage` and nothing else. The data read
 * re-checks the same role itself, and hands back setup facts only — never a
 * restaurant's menu, hours, or contact details.
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
import { requireOperatorPage } from "@/lib/operator-access";
import { listTenantSetups, type OperatorTenantSetup } from "@/lib/operator-tenants";
import { outstandingOnboardingSteps } from "@/lib/onboarding";

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
      </Section>
    </Container>
  );
}
