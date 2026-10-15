/**
 * Category editor (Phase 3.4). The parent layout already gated the
 * context; the page re-resolves it plus the category for its own data
 * load (same `notFound()` on failure — a forged id looks exactly like a
 * missing one, never an oracle) and hands the row plus its item count to
 * the form.
 *
 * The sync default export exists so the page's own read — `params`, then the
 * session, then the context — starts inside a `<Suspense>` boundary: without
 * it Next reports "encountered uncached data" and the client navigation
 * blocks on the data instead of painting the skeleton (Phase 4.5 sweep).
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantCategory, getTenantItems } from "@/lib/tenant-data";
import { PageSkeleton } from "../../../_components/page-skeleton";
import { CategoryEditForm } from "./_components/category-edit-form";

type Props = { params: Promise<{ slug: string; categoryId: string }> };

export default function CategoryEditPage({ params }: Props): React.ReactElement {
  return (
    <Suspense fallback={<PageSkeleton label="Loading category…" />}>
      <CategoryEditor params={params} />
    </Suspense>
  );
}

async function CategoryEditor({ params }: Props): Promise<React.ReactElement> {
  // Request-time before anything else: Auth.js reads random bytes while it
  // builds its CSRF token, which `cacheComponents` treats as IO, so a
  // prerender pass reaching `auth()` reports the crypto insight and this page
  // gets no static shell. The cookie decides all of it — nothing to prerender.
  await connection();
  const { slug, categoryId } = await params;
  const context = await getTenantContext(await auth(), slug);
  if (!context.ok) {
    notFound();
  }
  const [category, items] = await Promise.all([
    getTenantCategory(context.data, categoryId),
    getTenantItems(context.data, categoryId),
  ]);
  // A foreign id fails the ownership check inside both loaders, so both
  // errors collapse to the same page — never a cross-tenant signal.
  if (!category.ok || !items.ok) {
    notFound();
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1} className="mb-2">
          Edit category
        </Heading>
        <Text>
          {items.data.length} {items.data.length === 1 ? "item" : "items"} in this category.
        </Text>
      </div>
      <CategoryEditForm
        slug={context.data.tenant.slug}
        category={category.data}
        itemCount={items.data.length}
      />
    </div>
  );
}
