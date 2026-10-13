/**
 * Item editor (Phase 3.5). The parent layout already gated the context;
 * the page re-resolves it plus the item for its own data load (same
 * `notFound()` on failure — a forged id looks exactly like a missing one,
 * never an oracle) and hands the row plus the tenant categories to the
 * form for the category select.
 */
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantCategories, getTenantItem } from "@/lib/tenant-data";
import { formatPrice } from "@/themes/format";
import { ItemEditForm } from "./_components/item-edit-form";

export default async function ItemEditPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>;
}): Promise<React.ReactElement> {
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
