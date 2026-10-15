/**
 * Menu category list (Phase 3.4; cards in Phase B). The parent layout
 * already gated the context; the page re-resolves it for its own data load
 * (same `notFound()` on failure — no oracle) and renders categories in
 * display order with per-row item counts plus the create form.
 *
 * Row actions are plain server-action forms (no client JS): move up/down
 * renumbers the list, Edit leads to the per-category editor where
 * renaming, visibility, and deletion live.
 *
 * The sync default export exists so the page's own read — `params`, then the
 * session, then the categories and items — starts inside a `<Suspense>`
 * boundary: without it Next reports "encountered uncached data" and the client
 * navigation blocks on the data instead of painting the skeleton (Phase 4.5
 * sweep).
 */
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FolderPlus } from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getTenantCategories, getTenantItems } from "@/lib/tenant-data";
import { PageSkeleton } from "../../_components/page-skeleton";
import { CategoryCreateForm } from "./_components/category-create-form";
import { moveCategory } from "./actions";

type Props = { params: Promise<{ slug: string }> };

export default function MenuPage({ params }: Props): React.ReactElement {
  return (
    <Suspense fallback={<PageSkeleton label="Loading menu…" />}>
      <MenuCategoryList params={params} />
    </Suspense>
  );
}

async function MenuCategoryList({ params }: Props): Promise<React.ReactElement> {
  // Request-time before anything else: Auth.js reads random bytes while it
  // builds its CSRF token, and `cacheComponents` treats that as IO — a
  // prerender pass that reaches `auth()` reports the crypto insight otherwise.
  await connection();
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
      <Link
        href={`/dashboard/${tenantSlug}/menu/items`}
        className={buttonClasses({ variant: "outline", size: "sm" })}
      >
        Manage items →
      </Link>
      {categories.data.length === 0 ? (
        <EmptyState
          icon={<FolderPlus className="size-6" />}
          title="No categories yet"
          description="Add the first one below to start building the menu."
        />
      ) : (
        <ul className="flex max-w-3xl flex-col gap-3">
          {categories.data.map((category, index) => (
            <li key={category.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2 p-4 sm:p-4">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {category.name}
                    {category.isPublished ? null : <Badge>Unpublished</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
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
              </Card>
            </li>
          ))}
        </ul>
      )}
      {uncategorised > 0 ? (
        <Text>
          {uncategorised} {uncategorised === 1 ? "item is" : "items are"} uncategorised (shown under
          “Menu” on the public site).
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
