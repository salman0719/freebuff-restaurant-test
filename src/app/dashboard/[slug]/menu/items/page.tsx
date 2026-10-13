/**
 * Menu items list (Phase 3.5). The parent layout already gated the
 * context; the page re-resolves it for its own data load (same
 * `notFound()` on failure — no oracle) and renders items grouped under
 * their categories in display order, uncategorised last, plus the create
 * form. Renaming, repricing, reassignment, and visibility live in the
 * per-item editor; deletion waits there behind a confirm.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantCategories, getTenantItems } from "@/lib/tenant-data";
import type { MenuItem } from "@/lib/restaurant";
import { formatPrice } from "@/themes/format";
import { ItemCreateForm } from "./_components/item-create-form";

function ItemRow({ base, item }: { base: string; item: MenuItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {item.name}
          {item.isPublished ? null : (
            <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Unpublished
            </span>
          )}
          {item.isAvailable ? null : (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Unavailable
            </span>
          )}
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          ${formatPrice(item.priceCents)}
          {item.description ? ` — ${item.description}` : null}
        </p>
      </div>
      <Link
        href={`${base}/${item.id}`}
        className={buttonClasses({ variant: "outline", size: "sm" })}
      >
        Edit
      </Link>
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
          menu. Photos arrive with 3.6 uploads.
        </Text>
      </div>
      <Link
        href={`/dashboard/${tenantSlug}/menu`}
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        ← Back to categories
      </Link>
      {items.data.length === 0 ? (
        <Text>No items yet — add the first one below.</Text>
      ) : (
        <div className="flex max-w-2xl flex-col gap-6">
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
