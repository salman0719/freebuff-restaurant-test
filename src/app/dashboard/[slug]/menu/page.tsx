/**
 * Menu category list (Phase 3.4). The parent layout already gated the
 * context; the page re-resolves it for its own data load (same
 * `notFound()` on failure — no oracle) and renders categories in display
 * order with per-row item counts plus the create form.
 *
 * Row actions are plain server-action forms (no client JS): move up/down
 * renumbers the list, Edit leads to the per-category editor where
 * renaming, visibility, and deletion live.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Button, buttonClasses } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantCategories, getTenantItems } from "@/lib/tenant-data";
import { CategoryCreateForm } from "./_components/category-create-form";
import { moveCategory } from "./actions";

export default async function MenuPage({
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
  const counts = new Map<string, number>();
  let uncategorised = 0;
  for (const item of items.data) {
    if (item.categoryId == null) {
      uncategorised += 1;
    } else {
      counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1} className="mb-2">
          Menu categories
        </Heading>
        <Text>
          Categories appear on the public menu in this order. Unpublished categories stay hidden
          until you publish them.
        </Text>
      </div>
      {categories.data.length === 0 ? (
        <Text>No categories yet — add the first one below.</Text>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-3">
          {categories.data.map((category, index) => (
            <li
              key={category.id}
              className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {category.name}
                    {category.isPublished ? null : (
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        Unpublished
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {counts.get(category.id) ?? 0}{" "}
                    {(counts.get(category.id) ?? 0) === 1 ? "item" : "items"}
                    {category.description ? ` — ${category.description}` : null}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <form action={moveCategory}>
                    <input type="hidden" name="slug" value={tenantSlug} />
                    <input type="hidden" name="categoryId" value={category.id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      disabled={index === 0}
                      aria-label={`Move ${category.name} up`}
                    >
                      ↑
                    </Button>
                  </form>
                  <form action={moveCategory}>
                    <input type="hidden" name="slug" value={tenantSlug} />
                    <input type="hidden" name="categoryId" value={category.id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      disabled={index === categories.data.length - 1}
                      aria-label={`Move ${category.name} down`}
                    >
                      ↓
                    </Button>
                  </form>
                  <Link
                    href={`/dashboard/${tenantSlug}/menu/${category.id}`}
                    className={buttonClasses({ variant: "outline", size: "sm" })}
                  >
                    Edit
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {uncategorised > 0 ? (
        <Text>
          {uncategorised} {uncategorised === 1 ? "item is" : "items are"} uncategorised (shown under
          “Menu” on the public site). Item assignment arrives with 3.5.
        </Text>
      ) : null}
      <div>
        <Heading level={2} className="mb-4">
          Add a category
        </Heading>
        <CategoryCreateForm slug={tenantSlug} />
      </div>
    </div>
  );
}
