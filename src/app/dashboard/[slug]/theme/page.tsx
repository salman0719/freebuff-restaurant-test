/**
 * Theme selection and options (Phase 3.7; options in Phase C). The parent
 * layout already gated the context; the page re-resolves it for its own data
 * load (same `notFound()` on failure — no oracle).
 *
 * Two concerns, in order: pick a theme (one form per card, the refreshed
 * "Current" badge confirms), then tune that theme's options — accent, menu
 * layout, and its own visibility toggle. Options are validated against the
 * CURRENT theme's schema on the server, so switching themes falls back to
 * that theme's defaults rather than carrying incompatible values across.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { getTenantContext } from "@/lib/tenant-context";
import {
  accentsFor,
  MENU_LAYOUTS,
  resolveThemeConfig,
  themeToggle,
  type CafeConfig,
  type TakeawayConfig,
} from "@/themes/config";
import { listThemes } from "@/themes/registry";
import { saveTheme } from "./actions";
import { ThemeOptionsForm } from "./_components/theme-options-form";

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
  const config = resolveThemeConfig(current, context.data.tenant.themeConfig);
  const toggle = themeToggle(current);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div>
          <Heading level={1} className="mb-2">
            Theme
          </Heading>
          <Text>
            Every theme shows the same content — pick the look that suits the restaurant, then tune
            its options and preview the result with your drafts included.
          </Text>
        </div>
        <Link
          href={`/dashboard/${tenantSlug}/theme/preview`}
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          Preview site →
        </Link>
      </div>

      <section aria-label="Choose a theme" className="flex flex-col gap-3">
        <Heading level={2}>Choose a theme</Heading>
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
      </section>

      <section aria-label="Theme options" className="flex flex-col gap-3">
        <Heading level={2}>Options for this theme</Heading>
        <Text muted>
          Saved against the theme you are using now. Switching themes uses that theme&apos;s own
          defaults, so nothing carries over in a broken state.
        </Text>
        <ThemeOptionsForm
          slug={tenantSlug}
          accents={accentsFor(current)}
          layouts={MENU_LAYOUTS}
          current={{
            accent: config.accent,
            menuLayout: config.menuLayout,
            toggleName: toggle.name,
            toggleLabel: toggle.label,
            // The two option shapes are the only ones with a visibility
            // toggle; this map is what keeps the name and the read in sync.
            toggleChecked:
              toggle.name === "showHours"
                ? (config as CafeConfig).showHours
                : (config as TakeawayConfig).showDescription,
          }}
        />
      </section>
    </div>
  );
}
