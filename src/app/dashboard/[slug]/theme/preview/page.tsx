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
 *
 * The sync default export exists so the page's own read — `params`, then the
 * session, then the draft view — starts inside a `<Suspense>` boundary:
 * without it Next reports "encountered uncached data" and the client
 * navigation blocks on the data instead of painting the skeleton (Phase 4.5
 * sweep).
 */
import { createElement, Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getOwnerRestaurant } from "@/lib/tenant-data";
import { toPreviewRestaurant } from "@/lib/preview-restaurant";
import { resolveThemeConfig } from "@/themes/config";
import { getTheme, resolveThemeId } from "@/themes/registry";
import { PageSkeleton } from "../../../_components/page-skeleton";

type Props = { params: Promise<{ slug: string }> };

export default function PreviewPage({ params }: Props): React.ReactElement {
  return (
    <Suspense fallback={<PageSkeleton label="Loading preview…" />}>
      <ThemePreview params={params} />
    </Suspense>
  );
}

async function ThemePreview({ params }: Props): Promise<React.ReactElement> {
  // Request-time before anything else: Auth.js reads random bytes building
  // its CSRF token, which `cacheComponents` treats as IO. Without this the
  // prerender pass reaches `auth()` and reports the crypto insight.
  await connection();
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
