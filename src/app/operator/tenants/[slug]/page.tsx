/**
 * One restaurant, from the operator's side (Phase 4.2).
 *
 * Shows what the platform knows about the tenant — its address, theme, and
 * whether it is live — and the one action an operator takes here: granting
 * someone owner access. It deliberately does NOT link into the owner's
 * dashboard: operators are not members of the restaurants they provision, so
 * there is no dashboard to open until that access model is decided (4.4).
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
import { getOperatorTenant } from "@/lib/operator-tenants";
import { InviteOwnerForm } from "../../_components/invite-owner-form";

export default async function OperatorTenantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const staff = requireOperatorPage(await auth());
  const result = await getOperatorTenant(staff, slug);
  // A non-staff caller never reaches this line; an unknown slug is a 404.
  if (!result.ok || !result.data) {
    notFound();
  }
  const tenant = result.data;
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
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={tenant.published ? "success" : "warning"}>
              {tenant.published ? "Published" : "Draft"}
            </Badge>
            <Badge tone="neutral">{tenant.themeLabel} theme</Badge>
            {tenant.customDomain ? (
              <Badge tone="brand">{tenant.customDomain}</Badge>
            ) : (
              <Badge tone="neutral">Platform address only</Badge>
            )}
          </p>

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

          <section aria-label="Not yet configured">
            <Heading level={2} className="mb-2">
              Still to come
            </Heading>
            <Text size="sm" muted>
              A full setup checklist lands with the onboarding view; publishing, the menu, and the
              public address are the owner&apos;s to finish from their dashboard.
            </Text>
          </section>
        </Stack>
      </Section>
    </Container>
  );
}
