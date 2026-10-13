/**
 * Theme selection (Phase 3.7). The parent layout already gated the
 * context; the page re-resolves it for its own data load (same
 * `notFound()` on failure — no oracle) and lists every registered theme
 * with a per-card form posting the choice. The refreshed "Current" badge
 * confirms the save; the preview link beside it renders the draft site in
 * the selected theme.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import { listThemes } from "@/themes/registry";
import { saveTheme } from "./actions";

export default async function ThemePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const context = await getTenantContext(await auth(), slug);
  if (!context.ok) {
    notFound();
  }
  const tenantSlug = context.data.tenant.slug;
  const current = context.data.tenant.theme;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1} className="mb-2">
          Theme
        </Heading>
        <Text>
          Every theme shows the same content — pick the look that suits the restaurant, then preview
          it with the current drafts included.
        </Text>
      </div>
      <Link
        href={`/dashboard/${tenantSlug}/theme/preview`}
        className={buttonClasses({ variant: "outline", size: "sm" })}
      >
        Preview site →
      </Link>
      <ul className="grid max-w-2xl gap-3 sm:grid-cols-2">
        {listThemes().map((theme) => {
          const selected = theme.id === current;
          return (
            <li
              key={theme.id}
              className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3"
            >
              <p className="text-sm font-semibold text-foreground">
                {theme.label}
                {selected ? (
                  <Badge tone="success" className="ml-2">
                    Current
                  </Badge>
                ) : null}
              </p>
              <p className="text-sm text-muted-foreground">{theme.blurb}</p>
              {selected ? null : (
                <form action={saveTheme}>
                  <input type="hidden" name="slug" value={tenantSlug} />
                  <input type="hidden" name="theme" value={theme.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Use {theme.label}
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
