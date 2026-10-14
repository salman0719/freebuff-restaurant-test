/**
 * New restaurant (Phase 4.2). The operator's setup entry point: a tenant, its
 * profile name, a theme, and whether it starts published — nothing else. Safe
 * defaults are the server's job (`lib/tenant-provisioning.ts`), so the form
 * cannot express an unsafe state.
 *
 * Gated by `requireOperatorPage` and nothing else, like every other surface
 * under `src/app/operator`.
 *
 * The gate sits behind its own `<Suspense>` boundary, as on each restaurant's
 * page: the session read is what keeps the App Shell from being prerendered
 * for this route, so without the boundary an operator clicking "New
 * restaurant" waits on the server before anything paints. The header and the
 * way back stay in the shell.
 */
import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/container";
import { Skeleton, Spinner } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { requireOperatorPage } from "@/lib/operator-access";
import { listThemes } from "@/themes/registry";
import { CreateTenantForm } from "../../_components/create-tenant-form";

export default function NewTenantPage(): React.ReactElement {
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
        <Suspense fallback={<NewTenantFallback />}>
          <GatedCreateTenantForm />
        </Suspense>
      </Section>
    </Container>
  );
}

/** The form's loading state, shaped like the fields it stands in for. */
function NewTenantFallback(): React.ReactElement {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Spinner label="Loading form…" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-10 w-40" />
    </div>
  );
}

/**
 * The session-gated half: nothing renders for a caller who is not platform
 * staff, and the theme list is resolved here rather than in the shell so the
 * page holds no work nobody has been allowed to see.
 */
async function GatedCreateTenantForm(): Promise<React.ReactElement> {
  requireOperatorPage(await auth());
  const themes = listThemes().map((theme) => ({ id: theme.id, label: theme.label }));
  return <CreateTenantForm themes={themes} />;
}
