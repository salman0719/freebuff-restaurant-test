/**
 * Restaurant profile editor (Phase 3.2). The parent layout already
 * gated the context; the page re-resolves it for its own data load
 * (same `notFound()` on failure — no oracle) and hands the stored
 * profile to the form as initial values.
 */
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantProfile } from "@/lib/tenant-data";
import { ProfileForm } from "./_components/profile-form";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
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
