/**
 * Dashboard overview (Phase 3.1). The context is already
 * membership-gated by the parent layout; this page summarises status
 * (visibility, content counts) and links into the 3.2–3.5 editors.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getOwnerRestaurant } from "@/lib/tenant-data";
import { auth } from "@/auth";

export default async function TenantOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const context = await getTenantContext(await auth(), slug);
  if (!context.ok) {
    notFound();
  }
  const view = await getOwnerRestaurant(context.data);
  if (!view.ok) {
    notFound();
  }
  const { tenant, profile, hours, categories, items } = view.data;
  const hoursSet = hours.filter((row) => row.openTime ?? row.isClosed).length;
  const base = `/dashboard/${tenant.slug}`;
  const contact = profile?.phone ?? profile?.email ?? "No contact details yet";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Restaurant"
        title={profile?.name ?? tenant.slug}
        description={
          tenant.published
            ? "Live — visitors can find this restaurant on its public site."
            : "Draft — only you can see it until it is published."
        }
        actions={
          <Badge tone={tenant.published ? "success" : "neutral"}>
            {tenant.published ? "Live" : "Draft"}
          </Badge>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Menu"
          value={items.length}
          hint={`${categories.length} ${categories.length === 1 ? "category" : "categories"}`}
          icon={<UtensilsCrossed className="size-4" />}
        />
        <Stat
          label="Hours"
          value={`${hoursSet}/7`}
          hint="days set"
          icon={<Clock className="size-4" />}
        />
        <Card>
          <CardTitle>Contact</CardTitle>
          <Text className="mt-1">{contact}</Text>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/profile`} className={buttonClasses({ variant: "outline" })}>
          Edit profile
        </Link>
        <Link href={`${base}/hours`} className={buttonClasses({ variant: "outline" })}>
          Edit hours
        </Link>
        <Link href={`${base}/menu`} className={buttonClasses({ variant: "outline" })}>
          Edit menu
        </Link>
        <Link href={`${base}/publishing`} className={buttonClasses({ variant: "outline" })}>
          Publishing
        </Link>
      </div>
    </div>
  );
}
