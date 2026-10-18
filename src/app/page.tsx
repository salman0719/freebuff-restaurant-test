import { createElement, Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicRestaurant } from "@/lib/public-restaurant";
import { logServerEvent } from "@/lib/server-log";
import { resolveTenantByHost } from "@/lib/tenant-resolution";
import { resolveThemeConfig } from "@/themes/config";
import { getTheme, resolveThemeId } from "@/themes/registry";
import { RestaurantLoading } from "./_components/restaurant-loading";
import { SiteUnavailable } from "./_components/site-unavailable";

/**
 * Public restaurant website (Phase 2.7).
 *
 * The hostname IS the tenant address: resolve it → load the published view
 * → render the tenant's theme. Unknown hosts, unpublished tenants, and
 * drafts all end in `notFound()` — never another tenant's content.
 *
 * The tenant lookup reads `headers()`, which is runtime data, so the page
 * streams inside `<Suspense>`: prerender emits the loading shell and the
 * tenant content resolves per request. Nothing is cached across tenants.
 */
export default function Home(): React.ReactElement {
  return (
    <Suspense fallback={<RestaurantLoading />}>
      <TenantPage />
    </Suspense>
  );
}

async function TenantPage(): Promise<React.ReactElement> {
  const host = (await headers()).get("host") ?? "";
  // Dependency failures (database unreachable) are RENDERED, not thrown:
  // a throw inside this Suspense hole resolves to the not-found page,
  // whose "isn't published yet" copy would be a lie during an outage
  // (verified against a production server, Phase 6.2). Unknown tenants
  // still `notFound()` — that path means "no tenant here", honestly.
  let resolution: Awaited<ReturnType<typeof resolveTenantByHost>>;
  try {
    resolution = await resolveTenantByHost(host);
  } catch {
    logServerEvent({
      event: "public.resolve.failed",
      level: "error",
      message: "Public page could not resolve the tenant; serving unavailable state.",
      context: { host },
    });
    return <SiteUnavailable />;
  }
  if (!resolution.found) {
    notFound();
  }
  const result = await getPublicRestaurant(resolution.tenant.slug).catch(() => null);
  if (!result) {
    logServerEvent({
      event: "public.load.failed",
      level: "error",
      message: "Public page could not load published content; serving unavailable state.",
      context: { slug: resolution.tenant.slug },
    });
    return <SiteUnavailable />;
  }
  if (!result.ok) {
    notFound();
  }
  // Registry returns stable module-level components (never creates them),
  // so element identity is constant across renders; createElement keeps
  // the selection dynamic without tripping static-component analysis.
  const themeId = resolveThemeId(result.data.theme);
  return createElement(getTheme(themeId), {
    restaurant: result.data,
    config: resolveThemeConfig(themeId, result.data.themeConfig),
  });
}
