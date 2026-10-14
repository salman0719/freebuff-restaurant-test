/**
 * New restaurant (Phase 4.2). The operator's setup entry point: a tenant, its
 * profile name, a theme, and whether it starts published — nothing else. Safe
 * defaults are the server's job (`lib/tenant-provisioning.ts`), so the form
 * cannot express an unsafe state.
 *
 * Gated by `requireOperatorPage` and nothing else, like every other surface
 * under `src/app/operator`.
 */
import Link from "next/link";
import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/container";
import { PageHeader } from "@/components/ui/page-header";
import { requireOperatorPage } from "@/lib/operator-access";
import { listThemes } from "@/themes/registry";
import { CreateTenantForm } from "../../_components/create-tenant-form";

export default async function NewTenantPage(): Promise<React.ReactElement> {
  requireOperatorPage(await auth());
  const themes = listThemes().map((theme) => ({ id: theme.id, label: theme.label }));
  return (
    <Container className="py-8">
      <Section>
        <PageHeader
          eyebrow="Platform"
          title="New restaurant"
          description="Create the tenant, then invite the person who will run it."
          className="mb-6"
          actions={
            <Link href="/operator" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              ← Console
            </Link>
          }
        />
        <CreateTenantForm themes={themes} />
      </Section>
    </Container>
  );
}
