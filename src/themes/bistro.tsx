import Image from "next/image";
import { cn, Container, Eyebrow, Heading, Section, Stack, Text } from "@/components/ui";
import { imageUrlForKey } from "@/lib/image-url";
import type { BistroConfig } from "./config";
import { accentClasses, MenuSection, VisitSection } from "./sections";
import type { ThemeProps } from "./types";

/**
 * Bistro theme (Phase C). A third, deliberately different shape rather than
 * a reskin: a split hero (story on the left, logo on the right), a
 * card-based two-column menu by default, and deeper accent palettes (plum,
 * navy, sage). Same content model and the same shared sections as the other
 * themes — only arrangement, density, and palette differ.
 */
export function BistroTheme({ restaurant, config }: ThemeProps): React.ReactElement {
  const { accent, menuLayout, showHours } = config as BistroConfig;
  const classes = accentClasses(accent);
  return (
    <div className={classes.surface}>
      <Container>
        <Section aria-label="Restaurant introduction">
          <div className="grid items-center gap-8 lg:grid-cols-[1.5fr_1fr]">
            <Stack className="items-start text-left">
              <Eyebrow className={classes.eyebrow}>Bistro</Eyebrow>
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
                width={240}
                height={240}
                // Above the fold on every width, and the measured LCP element
                // on mobile — preloaded rather than lazy (Phase 6.3).
                priority
                className="mx-auto w-full max-w-60 rounded-2xl object-contain lg:mr-0 lg:ml-auto"
              />
            ) : null}
          </div>
        </Section>
        <MenuSection menu={restaurant.menu} accent={accent} layout={menuLayout} />
        <VisitSection restaurant={restaurant} accent={accent} showHours={showHours} />
      </Container>
    </div>
  );
}
