import Image from "next/image";
import { cn, Container, Eyebrow, Heading, Section, Stack, Text } from "@/components/ui";
import { imageUrlForKey } from "@/lib/image-url";
import type { PublicMenuCategory, PublicMenuItem } from "@/lib/restaurant";
import type { GardenConfig } from "./config";
import { formatPrice } from "./format";
import { accentClasses, MenuSection, VisitSection } from "./sections";
import type { ThemeProps } from "./types";

/**
 * Garden theme (0004 — Market Garden). Farm-to-table / plant-forward: the
 * platform's first cool-palette family (green and teal on slate, where
 * every other theme leans warm), arranged asymmetrically — a 1.6/1 hero
 * that the logo panel hangs off, and a two-column menu/visit split at
 * desktop width instead of the stacked rhythm café and diner use.
 *
 * Its own module is **From the market this week**: the first item of up to
 * three categories, surfaced as a seasonal short list. It is derived from
 * the tenant's real menu (nothing invented, no extra schema) and stays
 * absent when the menu is empty, so the shared empty state still shows.
 *
 * Same content model and shared sections as every other theme — only the
 * arrangement, palette, and this one module differ.
 */
export function GardenTheme({ restaurant, config }: ThemeProps): React.ReactElement {
  const { accent, menuLayout, showHours } = config as GardenConfig;
  const classes = accentClasses(accent);
  const inSeason = seasonalPicks(restaurant.menu);
  return (
    <div className={classes.surface}>
      <Container>
        {/* Asymmetric hero: the story takes the wide column, the logo a
            smaller one that hangs from the baseline. */}
        <Section aria-label="Restaurant introduction">
          <div className="grid items-end gap-8 lg:grid-cols-[1.6fr_1fr]">
            <Stack className="items-start text-left">
              <Eyebrow className={classes.eyebrow}>Market garden</Eyebrow>
              <span aria-hidden="true" className={cn("h-1 w-12 rounded-full", classes.rule)} />
              <Heading level={1} className={classes.heading}>
                {restaurant.name}
              </Heading>
              {restaurant.description ? <Text>{restaurant.description}</Text> : null}
            </Stack>
            {restaurant.logoImageKey ? (
              <Image
                src={imageUrlForKey(restaurant.logoImageKey)}
                alt={`${restaurant.name} logo`}
                width={320}
                height={320}
                // The largest painted block on this theme's mobile hero — the
                // measured LCP element — so it loads eagerly (Phase 6.3).
                priority
                className="w-full max-w-72 rounded-[2rem] object-cover lg:ml-auto"
              />
            ) : null}
          </div>
        </Section>

        {inSeason.length > 0 ? (
          <Section aria-label="In season">
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <Eyebrow className={classes.eyebrow}>In season</Eyebrow>
              <Heading level={2} className={cn(classes.heading, "mt-2")}>
                From the market this week
              </Heading>
              <ul className="mt-5 grid gap-5 sm:grid-cols-3">
                {inSeason.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1.5">
                    <span aria-hidden="true" className={cn("h-1 w-8 rounded-full", classes.rule)} />
                    <p className="text-base font-medium text-foreground">{item.name}</p>
                    <Text size="sm">{formatPrice(item.priceCents)}</Text>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        ) : null}

        {/* Asymmetric body: menu leads in the wide column, visit details sit
            alongside it rather than below. */}
        <div className="grid gap-10 lg:grid-cols-[1.7fr_1fr] lg:items-start">
          <MenuSection menu={restaurant.menu} accent={accent} layout={menuLayout} />
          <div className="lg:sticky lg:top-8">
            <VisitSection restaurant={restaurant} accent={accent} showHours={showHours} />
          </div>
        </div>
      </Container>
    </div>
  );
}

/**
 * The first item of up to three categories — a deterministic "what is good
 * right now" list. No randomness: the same menu must render the same
 * module on the server and the client.
 */
function seasonalPicks(menu: PublicMenuCategory[]): PublicMenuItem[] {
  return menu
    .map((category) => category.items[0])
    .filter((item): item is PublicMenuItem => Boolean(item))
    .slice(0, 3);
}
