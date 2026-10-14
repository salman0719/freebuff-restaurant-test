import { Container } from "@/components/ui";
import type { CafeConfig } from "./config";
import { accentClasses, HeroSection, MenuSection, VisitSection } from "./sections";
import type { ThemeProps } from "./types";

/**
 * Café theme — Modern Trattoria (Phase 2.3, refreshed in the 0004
 * appearance round). Warm, editorial, and **menu-first**: a left-aligned
 * hero sets the name and a short story, then hands straight to the menu
 * with almost no break between them (`pb-0` — the menu's own rhythm
 * supplies the gap), so the food is the first thing after the welcome
 * rather than three centred flourishes down the page.
 *
 * The ink is warmer than the original: espresso, terracotta, and tomato,
 * all over the house cream surface. Composed from the shared sections —
 * the narrative order, alignment, and palette are this theme's only
 * unique decisions.
 *
 * Logos render from Phase 3.6 storage via the shared `HeroSection` (the
 * key resolves to `/api/images/…` with `imageUrlForKey`).
 */
export function CafeTheme({ restaurant, config }: ThemeProps): React.ReactElement {
  const { accent, showHours, menuLayout } = config as CafeConfig;
  return (
    <div className={accentClasses(accent).surface}>
      <Container>
        <HeroSection
          restaurant={restaurant}
          kicker="Trattoria"
          accent={accent}
          align="left"
          className="pb-2 sm:pb-3"
        />
        <MenuSection menu={restaurant.menu} accent={accent} layout={menuLayout} />
        <VisitSection restaurant={restaurant} accent={accent} showHours={showHours} />
      </Container>
    </div>
  );
}
