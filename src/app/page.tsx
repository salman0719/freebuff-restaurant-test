import { createElement, Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicRestaurant } from "@/lib/public-restaurant";
import { resolveTenantByHost } from "@/lib/tenant-resolution";
import { getTheme, resolveThemeId } from "@/themes/registry";

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
    <Suspense fallback={<p role="status">Loading restaurant…</p>}>
      <TenantPage />
    </Suspense>
  );
}

async function TenantPage(): Promise<React.ReactElement> {
  const host = (await headers()).get("host") ?? "";
  const resolution = await resolveTenantByHost(host);
  if (!resolution.found) {
    notFound();
  }
  const result = await getPublicRestaurant(resolution.tenant.slug);
  if (!result.ok) {
    notFound();
  }
  // Registry returns stable module-level components (never creates them),
  // so element identity is constant across renders; createElement keeps
  // the selection dynamic without tripping static-component analysis.
  return createElement(getTheme(resolveThemeId(result.data.theme)), {
    restaurant: result.data,
  });
}
