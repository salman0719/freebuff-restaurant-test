/**
 * Operator console (Phase 3.1; gated by the Phase 4.1 gate).
 *
 * 4.2 gave the console something real to do, so the placeholder is replaced
 * by the setup entry point. The tenant list with each restaurant's onboarding
 * status arrives with 4.3; until then this points at the flow rather than
 * promising a console that is not there.
 *
 * Access is decided by `requireOperatorPage` and nothing else: anonymous
 * visitors land on `/login?next=/operator`, and a signed-in owner sees the
 * same not-found page as an unknown route (the console's existence is never
 * confirmed to them).
 */
import Link from "next/link";
import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Container, Section, Stack } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { Text } from "@/components/ui/typography";
import { requireOperatorPage } from "@/lib/operator-access";

export default async function OperatorPage(): Promise<React.ReactElement> {
  // Throws (redirect) or renders the not-found page for everyone else.
  requireOperatorPage(await auth());
  return (
    <Container className="py-8">
      <Section>
        <PageHeader
          eyebrow="Platform"
          title="Operator console"
          description="Signed in as platform staff."
          className="mb-6"
        />
        <Stack className="max-w-2xl">
          <Card>
            <CardTitle>Set up a restaurant</CardTitle>
            <CardContent>
              <Text size="sm" muted>
                Create the tenant with its address and default theme, then invite the person who
                will run it. That person gets access through a membership; you do not, which is why
                the owner step matters.
              </Text>
              <div>
                <Link href="/operator/tenants/new" className={buttonClasses({ size: "sm" })}>
                  New restaurant
                </Link>
              </div>
            </CardContent>
          </Card>
        </Stack>
      </Section>
    </Container>
  );
}
