/**
 * Category editor (Phase 3.4). The parent layout already gated the
 * context; the page re-resolves it plus the category for its own data
 * load (same `notFound()` on failure — a forged id looks exactly like a
 * missing one, never an oracle) and hands the row plus its item count to
 * the form.
 */
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantCategory, getTenantItems } from "@/lib/tenant-data";
import { CategoryEditForm } from "./_components/category-edit-form";

export default async function CategoryEditPage({
  params,
}: {
  params: Promise<{ slug: string; categoryId: string }>;
}): Promise<React.ReactElement> {
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
