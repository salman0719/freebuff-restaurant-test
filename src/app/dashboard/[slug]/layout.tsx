/**
 * Tenant dashboard shell (Phase 3.1). Server-side protection:
 * anonymous visitors bounce to `/login`, and any failure to establish
 * the membership-gated context (unknown slug, no membership) renders
 * `notFound()` — the same page for both, so signed-in users cannot
 * probe which slugs exist (see 0003, and `tenant-context.ts`).
 *
 * The shell is a sticky `SiteNav` (collapses to a menu on mobile) with
 * the role-filtered sections from `../nav` plus a sign-out action.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SiteNav } from "@/components/ui/site-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getTenantContext, listUserTenants } from "@/lib/tenant-context";
import { getTenantProfile } from "@/lib/tenant-data";
import { requireUser } from "@/lib/permissions";
import { getDashboardNav } from "../nav";
import { DashboardNavLinks } from "../nav-links";
import { RestaurantSwitcher } from "../restaurant-switcher";

async function signOutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function TenantDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  // Next 16's generated layout props type `params` as `Promise<unknown>`
  // for this segment, so narrow at the boundary: non-string slugs fall
  // through to the same `notFound()` as unknown tenants (no oracle).
  params: Promise<unknown>;
}): Promise<React.ReactElement> {
  const resolved = (await params) as { slug?: unknown };
  const slug = typeof resolved.slug === "string" ? resolved.slug : "";
  const session = await auth();
  if (!requireUser(session).ok) {
    redirect(`/login?next=/dashboard/${slug}`);
  }
  const context = await getTenantContext(session, slug);
  if (!context.ok) {
    notFound();
  }
  const { tenant, membership } = context.data;
  const [profile, listed] = await Promise.all([
    getTenantProfile(context.data),
    listUserTenants(session),
  ]);
  const name = profile.ok && profile.data ? profile.data.name : tenant.slug;
  const others = listed.ok
    ? listed.data.map((row) => ({ slug: row.slug, published: row.published }))
    : [];
  const items = getDashboardNav({
    slug: tenant.slug,
    membershipRole: membership.role,
    globalRole: session?.user?.role ?? "owner",
  });
  return (
    <>
      <SiteNav
        label="Dashboard"
        brand={
          <span className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Restaurants
            </Link>
            <span aria-hidden="true" className="text-muted-foreground/40">
              /
            </span>
            <RestaurantSwitcher
              currentLabel={name}
              currentSlug={tenant.slug}
              restaurants={others}
            />
          </span>
        }
        links={<DashboardNavLinks items={items} />}
        actions={
          <>
            <ThemeToggle />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </>
        }
      />
      <Container className="py-8">{children}</Container>
    </>
  );
}
