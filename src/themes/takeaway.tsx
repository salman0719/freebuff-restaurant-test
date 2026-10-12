import { Container } from "@/components/ui";
import type { TakeawayConfig } from "./config";
import { HeroSection, MenuSection, VisitSection } from "./sections";
import type { ThemeProps } from "./types";

/**
 * Takeaway theme composed from the same sections as café (Phase 2.3
 * composition proof): menu leads, details follow in one left-aligned pass.
 * Full visual distinction arrives in Phase 2.4; structure is already shared.
 */
export function TakeawayTheme({ restaurant, config }: ThemeProps): React.ReactElement {
  const { accent, showDescription } = config as TakeawayConfig;
  return (
    <Container>
      <HeroSection
        restaurant={restaurant}
        kicker="Takeaway"
        accent={accent}
        align="left"
        showDescription={showDescription}
      />
      <MenuSection menu={restaurant.menu} accent={accent} />
      <VisitSection restaurant={restaurant} accent={accent} />
    </Container>
  );
}
