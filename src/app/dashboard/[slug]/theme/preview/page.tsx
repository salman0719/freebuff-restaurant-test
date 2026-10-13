/**
 * Private site preview (Phase 3.7). Membership-gated like every dashboard
 * page: the context resolves the tenant, `getOwnerRestaurant` loads the
 * full private picture, and `toPreviewRestaurant` assembles it WITHOUT
 * publication filtering — unpublished categories and items render, so
 * owners see what saving + publishing would put live.
 *
 * Another tenant's preview is unreachable: a forged slug fails the same
 * membership check as every other dashboard route and renders the same
 * `notFound()`. The banner marks this as a draft view — public visitors
 * only ever see published content through the host-resolved public page.
 */
import { createElement } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getOwnerRestaurant } from "@/lib/tenant-data";
import { toPreviewRestaurant } from "@/lib/preview-restaurant";
import { resolveThemeConfig } from "@/themes/config";
import { getTheme, resolveThemeId } from "@/themes/registry";

export default async function PreviewPage({
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
  const restaurant = toPreviewRestaurant(view.data);
  const themeId = resolveThemeId(restaurant.theme);
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950">
        <Heading level={1} className="mb-1">
          Preview
        </Heading>
        <Text>
          Draft view — unpublished categories and items are included below. Public visitors only see
          published content.
        </Text>
        <p className="mt-2">
          <Link
            href={`/dashboard/${context.data.tenant.slug}/theme`}
            className={buttonClasses({ variant: "outline", size: "sm" })}
          >
            ← Back to themes
          </Link>
        </p>
      </div>
      {createElement(getTheme(themeId), {
        restaurant,
        config: resolveThemeConfig(themeId, restaurant.themeConfig),
      })}
    </div>
  );
}
