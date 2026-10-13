/**
 * Dashboard overview (Phase 3.1). The context is already
 * membership-gated by the parent layout; this page summarises status
 * (visibility, content counts) and links into the 3.2–3.5 editors.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
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
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1} className="mb-2">
          {profile?.name ?? tenant.slug}
        </Heading>
        <Text>
          {tenant.published ? <strong>Live</strong> : <strong>Draft</strong>}{" "}
          {tenant.published
            ? "— visitors can find this restaurant."
            : "— only you can see it until it is published."}{" "}
          Theme: {tenant.theme}.
        </Text>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <CardTitle>Menu</CardTitle>
            <Text>
              {categories.length} {categories.length === 1 ? "category" : "categories"},{" "}
              {items.length} {items.length === 1 ? "item" : "items"}
            </Text>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CardTitle>Hours</CardTitle>
            <Text>
              {hoursSet} of 7 {hoursSet === 1 ? "day" : "days"} set
            </Text>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CardTitle>Contact</CardTitle>
            <Text>{profile?.phone ?? profile?.email ?? "No contact details yet"}</Text>
          </CardContent>
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
