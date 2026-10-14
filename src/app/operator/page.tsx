/**
 * Operator console placeholder (Phase 3.1; gated by the Phase 4.1 gate). The
 * full console — tenant provisioning, platform status — arrives in 4.2–4.4;
 * this stub reserves the `/operator` target the dashboard nav links to so
 * global operators never hit a dead end.
 *
 * Access is decided by `requireOperatorPage` and nothing else: anonymous
 * visitors land on `/login?next=/operator`, and a signed-in owner sees the
 * same not-found page as an unknown route (the console's existence is never
 * confirmed to them).
 */
import { Construction } from "lucide-react";
import { auth } from "@/auth";
import { Container, Section } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
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
        <EmptyState
          icon={<Construction className="size-6" />}
          title="Console arrives in Phase 4"
          description="Tenant provisioning, onboarding review, and platform status will live here."
        />
      </Section>
    </Container>
  );
}
