/**
 * Item editor (Phase 3.5). The parent layout already gated the context;
 * the page re-resolves it plus the item for its own data load (same
 * `notFound()` on failure — a forged id looks exactly like a missing one,
 * never an oracle) and hands the row plus the tenant categories to the
 * form for the category select.
 *
 * The sync default export exists so the page's own read — `params`, then the
 * session, then the item — starts inside a `<Suspense>` boundary: without it
 * Next reports "encountered uncached data" and the client navigation blocks
 * on the data instead of painting the skeleton (Phase 4.5 sweep).
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantCategories, getTenantItem } from "@/lib/tenant-data";
import { formatPrice } from "@/themes/format";
import { PageSkeleton } from "../../../../_components/page-skeleton";
import { ItemEditForm } from "./_components/item-edit-form";

type Props = { params: Promise<{ slug: string; itemId: string }> };

export default function ItemEditPage({ params }: Props): React.ReactElement {
  return (
    <Suspense fallback={<PageSkeleton label="Loading item…" />}>
      <ItemEditor params={params} />
    </Suspense>
  );
}

async function ItemEditor({ params }: Props): Promise<React.ReactElement> {
  // Request-time before anything else: Auth.js reads random bytes while it
  // builds its CSRF token, which `cacheComponents` treats as IO, so a
  // prerender pass reaching `auth()` reports the crypto insight and this page
  // gets no static shell. The cookie decides all of it — nothing to prerender.
  await connection();
  const { slug, itemId } = await params;
  const context = await getTenantContext(await auth(), slug);
  if (!context.ok) {
    notFound();
  }
  const [item, categories] = await Promise.all([
    getTenantItem(context.data, itemId),
    getTenantCategories(context.data),
  ]);
  // A foreign id fails the ownership check inside the item loader, so the
  // error collapses to the same page — never a cross-tenant signal.
  if (!item.ok || !categories.ok) {
    notFound();
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1} className="mb-2">
          Edit item
        </Heading>
        <Text>Currently ${formatPrice(item.data.priceCents)}.</Text>
      </div>
      <ItemEditForm slug={context.data.tenant.slug} item={item.data} categories={categories.data} />
    </div>
  );
}
