/**
 * Restaurant profile editor (Phase 3.2). The parent layout already
 * gated the context; the page re-resolves it for its own data load
 * (same `notFound()` on failure — no oracle) and hands the stored
 * profile to the form as initial values.
 *
 * The sync default export exists so the page's own read — `params`, then the
 * session, then the profile — starts inside a `<Suspense>` boundary: without
 * it Next reports "encountered uncached data" and the client navigation
 * blocks on the data instead of painting the skeleton (Phase 4.5 sweep).
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantProfile } from "@/lib/tenant-data";
import { PageSkeleton } from "../../_components/page-skeleton";
import { ProfileForm } from "./_components/profile-form";

type Props = { params: Promise<{ slug: string }> };

export default function ProfilePage({ params }: Props): React.ReactElement {
  return (
    <Suspense fallback={<PageSkeleton label="Loading profile…" />}>
      <ProfileEditor params={params} />
    </Suspense>
  );
}

async function ProfileEditor({ params }: Props): Promise<React.ReactElement> {
  // Request-time before anything else: Auth.js reads random bytes while it
  // builds its CSRF token, which `cacheComponents` treats as IO, so a
  // prerender pass that reaches `auth()` reports the crypto insight. This page
  // can never be prerendered — the cookie decides all of it — and saying so
  // here keeps the shell a static skeleton instead.
  await connection();
  const { slug } = await params;
  const context = await getTenantContext(await auth(), slug);
  if (!context.ok) {
    notFound();
  }
  const profile = await getTenantProfile(context.data);
  if (!profile.ok) {
    notFound();
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1} className="mb-2">
          Profile
        </Heading>
        <Text>Shown on the public site exactly as entered here.</Text>
      </div>
      <ProfileForm slug={context.data.tenant.slug} profile={profile.data} />
    </div>
  );
}
