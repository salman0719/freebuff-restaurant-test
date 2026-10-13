/**
 * Menu items list (Phase 3.5; photo cards in Phase B). The parent layout
 * already gated the context; the page re-resolves it for its own data load
 * (same `notFound()` on failure — no oracle) and renders items grouped under
 * their categories in display order, uncategorised last, plus the create
 * form. Renaming, repricing, reassignment, and visibility live in the
 * per-item editor; deletion waits there behind a confirm.
 */
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { imageUrlForKey } from "@/lib/image-url";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantCategories, getTenantItems } from "@/lib/tenant-data";
import type { MenuItem } from "@/lib/restaurant";
import { formatPrice } from "@/themes/format";
import { ItemCreateForm } from "./_components/item-create-form";

/** Item thumbnail, or a neutral placeholder tile when the item has no photo. */
function ItemThumb({ imageKey }: { imageKey: string | null }) {
  if (!imageKey) {
    return (
      <span
        aria-hidden="true"
        className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground"
      >
        <UtensilsCrossed className="size-5" />
      </span>
    );
  }
  return (
    <Image
      src={imageUrlForKey(imageKey)}
      alt=""
      width={56}
      height={56}
      className="size-14 shrink-0 rounded-lg object-cover"
    />
  );
}

function ItemRow({ base, item }: { base: string; item: MenuItem }) {
  return (
    <li>
      <Card className="flex flex-wrap items-center gap-4 p-4 sm:p-4">
        <ItemThumb imageKey={item.imageKey} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            {item.name}
            {item.isPublished ? null : <Badge>Unpublished</Badge>}
            {item.isAvailable ? null : <Badge tone="warning">Unavailable</Badge>}
          </p>
          {item.description ? (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          ) : null}
        </div>
        <Badge tone="brand">${formatPrice(item.priceCents)}</Badge>
        <Link
          href={`${base}/${item.id}`}
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          Edit
        </Link>
      </Card>
    </li>
  );
}

export default async function ItemsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const context = await getTenantContext(await auth(), slug);
  if (!context.ok) {
    notFound();
  }
  const [categories, items] = await Promise.all([
    getTenantCategories(context.data),
    getTenantItems(context.data),
  ]);
  if (!categories.ok || !items.ok) {
    notFound();
  }
  const tenantSlug = context.data.tenant.slug;
  const base = `/dashboard/${tenantSlug}/menu/items`;
  const byCategory = new Map<string, MenuItem[]>();
  const uncategorised: MenuItem[] = [];
  for (const item of items.data) {
    if (item.categoryId == null) {
      uncategorised.push(item);
    } else {
      const group = byCategory.get(item.categoryId) ?? [];
      group.push(item);
      byCategory.set(item.categoryId, group);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1} className="mb-2">
          Menu items
        </Heading>
        <Text>
          Prices show in dollars and cents. Unpublished or unavailable items stay off the public
          menu.
        </Text>
      </div>
      <Link
        href={`/dashboard/${tenantSlug}/menu`}
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        ← Back to categories
      </Link>
      {items.data.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="size-6" />}
          title="No items yet"
          description="Add the first one below to start building the menu."
        />
      ) : (
        <div className="flex max-w-3xl flex-col gap-6">
          {categories.data.map((category) => {
            const group = byCategory.get(category.id) ?? [];
            if (group.length === 0) return null;
            return (
              <section key={category.id} aria-label={category.name}>
                <Heading level={2} className="mb-2">
                  {category.name}
                </Heading>
                <ul className="flex flex-col gap-3">
                  {group.map((item) => (
                    <ItemRow key={item.id} base={base} item={item} />
                  ))}
                </ul>
              </section>
            );
          })}
          {uncategorised.length > 0 ? (
            <section aria-label="Uncategorised">
              <Heading level={2} className="mb-2">
                Uncategorised
              </Heading>
              <ul className="flex flex-col gap-3">
                {uncategorised.map((item) => (
                  <ItemRow key={item.id} base={base} item={item} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
      <div>
        <Heading level={2} className="mb-4">
          Add an item
        </Heading>
        <ItemCreateForm slug={tenantSlug} categories={categories.data} />
      </div>
    </div>
  );
}
