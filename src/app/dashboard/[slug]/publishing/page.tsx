/**
 * Publishing page (Phase 3.8). The parent layout already gated the
 * context; the page re-resolves it for its own data load (same
 * `notFound()` on failure — no oracle) and shows three things: the
 * current visibility state in plain words, an advisory readiness
 * checklist linking to the editors that fill the gaps, and the
 * publish/unpublish controls.
 *
 * Draft semantics for the MVP, stated honestly on the page: the
 * `published` flag gates the whole public site, and unpublished
 * categories/items stay hidden — but edits to already-visible records go
 * live immediately. There is no edit-staging or versioning; the preview
 * (3.7) is how owners check drafts before and after publishing.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { getOwnerRestaurant } from "@/lib/tenant-data";
import { PublishControls } from "./_components/publish-controls";
import { getPublishingChecklist } from "./checklist";

export default async function PublishingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const context = await getTenantContext(await auth(), slug);
  if (!context.ok) {
    notFound();
  }
  const view = await getOwnerRestaurant(context.data);
  if (!view.ok) {
    notFound();
  }
  const tenantSlug = context.data.tenant.slug;
  const checklist = getPublishingChecklist(tenantSlug, view.data);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1} className="mb-2">
          Publishing
        </Heading>
        {view.data.tenant.published ? (
          <Text>
            <strong>Live</strong> — visitors can find this restaurant at its assigned address, and
            see everything marked published.
          </Text>
        ) : (
          <Text>
            <strong>Draft</strong> — the public site is offline. Only members of this restaurant can
            see its content, including the preview.
          </Text>
        )}
      </div>
      <section aria-label="Readiness">
        <Heading level={2} className="mb-2">
          Before publishing
        </Heading>
        <Text>Suggestions, not requirements — publishing stays one click even with gaps.</Text>
        <ul className="mt-2 flex max-w-2xl flex-col gap-2">
          {checklist.map((entry) => (
            <li
              key={entry.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-3"
            >
              <p className="text-sm text-foreground">
                {entry.met ? "✓ " : "○ "}
                {entry.label}
              </p>
              {entry.met ? null : (
                <Link
                  href={entry.href}
                  className="text-sm font-medium text-foreground/80 underline"
                >
                  Fix →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Visibility">
        <Heading level={2} className="mb-2">
          Visibility
        </Heading>
        <Text>
          Unpublished categories and items stay hidden either way. Note that edits to
          already-visible records go live immediately — use the preview to check drafts.
        </Text>
        <div className="mt-4">
          <PublishControls slug={tenantSlug} published={view.data.tenant.published} />
        </div>
      </section>
    </div>
  );
}
