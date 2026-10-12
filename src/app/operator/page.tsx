/**
 * Operator console placeholder (Phase 3.1). The full console —
 * tenant provisioning, platform status — arrives in Phase 4; this
 * stub reserves the `/operator` target the dashboard nav links to so
 * global operators never hit a dead end. Real protection from day
 * one: anonymous visitors bounce to `/login`, signed-in non-staff
 * see the same not-found page as an unknown route (never confirm
 * the console exists to them).
 */
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container, Section } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { requireOperator } from "@/lib/permissions";

export default async function OperatorPage(): Promise<React.ReactElement> {
  const session = await auth();
  const check = requireOperator(session);
  if (!check.ok) {
    if (check.error.code === "UNAUTHORIZED") {
      redirect("/login?next=/operator");
    }
    notFound();
  }
  return (
    <Container className="py-8">
      <Section>
        <Heading level={1} className="mb-2">
          Operator console
        </Heading>
        <Text className="mb-6">Signed in as platform staff.</Text>
        <EmptyState
          title="Console arrives in Phase 4"
          description="Tenant provisioning, onboarding review, and platform status will live here."
        />
      </Section>
    </Container>
  );
}
