/**
 * One restaurant, from the operator's side (Phase 4.2, checklist in 4.3).
 *
 * Shows what the platform knows about the tenant — its address, theme, and
 * whether it is live — the full setup checklist, and the one action an
 * operator takes here: granting someone owner access.
 *
 * It deliberately does NOT link into the owner's dashboard. Operators are not
 * members of the restaurants they provision, so there is no dashboard to open
 * until that access model is decided (4.4) — which is also why the owner step
 * below still means something.
 *
 * Gated by `requireOperatorPage`; an unknown slug is the same not-found page
 * as anywhere else.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Container, Section, Stack } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { Heading, Text } from "@/components/ui/typography";
import { requireOperatorPage } from "@/lib/operator-access";
import { getTenantSetup } from "@/lib/operator-tenants";
import { outstandingOnboardingSteps } from "@/lib/onboarding";
import { InviteOwnerForm } from "../../_components/invite-owner-form";

export default async function OperatorTenantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const staff = requireOperatorPage(await auth());
  const result = await getTenantSetup(staff, slug);
  // A non-staff caller never reaches this line; an unknown slug is a 404.
  if (!result.ok || !result.data) {
    notFound();
  }
  const tenant = result.data;
  const outstanding = outstandingOnboardingSteps(tenant.steps);
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
