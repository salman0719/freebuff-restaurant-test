import { Container } from "@/components/ui";
import type { CafeConfig } from "./config";
import { HeroSection, MenuSection, VisitSection } from "./sections";
import type { ThemeProps } from "./types";

/**
 * Café theme (Phase 2.3). Warm, centred, editorial: story first, then menu,
 * then visit details. Composed from shared sections — the narrative order
 * and accent are this theme's only unique decisions.
 *
 * Logo images arrive with Phase 3.6 storage; `logoImageKey` is a provider
 * object key, not a URL, so nothing renders an `<img>` until the public-URL
 * adapter exists.
 */
export function CafeTheme({ restaurant, config }: ThemeProps): React.ReactElement {
  const { accent, showHours } = config as CafeConfig;
  return (
    <Container className="bg-amber-50/60 dark:bg-stone-950">
      <HeroSection
        restaurant={restaurant}
        kicker="Café & Restaurant"
        accent={accent}
        align="center"
      />
      <MenuSection menu={restaurant.menu} accent={accent} />
      <VisitSection restaurant={restaurant} accent={accent} showHours={showHours} />
    </Container>
  );
}
