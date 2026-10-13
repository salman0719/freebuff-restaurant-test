/**
 * Dashboard landing (Phase 3.1). Lists the restaurants the session
 * user belongs to — multi-tenant owners pick one; single-restaurant
 * owners get one link. Anonymous visitors bounce to `/login`
 * (the proxy normally does this first; the check here is the real one).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Container, Section } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Text } from "@/components/ui/typography";
import { listUserTenants } from "@/lib/tenant-context";
import { requireUser } from "@/lib/permissions";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!requireUser(session).ok) {
    redirect("/login?next=/dashboard");
  }
  const listed = await listUserTenants(session);
  if (!listed.ok) {
    redirect("/login?next=/dashboard");
  }
  const restaurants = listed.data;
  return (
    <Container className="py-8">
      <Section>
        <PageHeader
          eyebrow="Your account"
          title="Your restaurants"
          description="Choose a restaurant to manage its public site."
          className="mb-6"
        />
        {restaurants.length === 0 ? (
          <EmptyState
            icon={<Store className="size-6" />}
            title="No restaurants yet"
            description="You are signed in, but no restaurant has added you. Ask your operator for an invite."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {restaurants.map((restaurant) => (
              <li key={restaurant.slug}>
                <Card interactive>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        {restaurant.slug}
                        <Badge tone={restaurant.published ? "success" : "neutral"}>
                          {restaurant.published ? "Live" : "Draft"}
                        </Badge>
                      </CardTitle>
                      <Text muted className="mt-1 capitalize">
                        {restaurant.role}
                      </Text>
                    </div>
                    <Link
                      href={`/dashboard/${restaurant.slug}`}
                      className={buttonClasses({ variant: "outline" })}
                    >
                      Open dashboard →
                    </Link>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Container>
  );
}
