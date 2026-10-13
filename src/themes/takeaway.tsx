import Image from "next/image";
import {
  buttonClasses,
  cn,
  Container,
  Eyebrow,
  Heading,
  Section,
  Stack,
  Text,
} from "@/components/ui";
import { imageUrlForKey } from "@/lib/image-url";
import type { TakeawayConfig } from "./config";
import { HoursList } from "./hours";
import { accentClasses, MenuSection, VisitSection } from "./sections";
import type { ThemeProps } from "./types";

/**
 * Takeaway theme (Phase 2.4). Bold and high-contrast: an accent hero band
 * with a call-to-order CTA, a dense dotted-leader menu, and a compact
 * find-us strip. Same content model as café, composed from the same
 * sections — only order, density, and palette differ. No ordering or
 * payment features: the CTA is a plain `tel:` contact link.
 */
export function TakeawayTheme({ restaurant, config }: ThemeProps): React.ReactElement {
  const { accent, showDescription, menuLayout } = config as TakeawayConfig;
  const classes = accentClasses(accent);
  return (
    <>
      <div className={classes.band}>
        <Container>
          <Section aria-label="Restaurant introduction">
            <Stack className="items-start text-left">
              {restaurant.logoImageKey ? (
                <Image
                  src={imageUrlForKey(restaurant.logoImageKey)}
                  alt={`${restaurant.name} logo`}
                  width={64}
                  height={64}
                  className="rounded-xl object-contain"
                />
              ) : null}
              <Eyebrow className={classes.bandEyebrow}>Takeaway</Eyebrow>
              <Heading level={1} className={classes.bandText}>
                {restaurant.name}
              </Heading>
              {showDescription && restaurant.description ? (
                <Text className={classes.bandBody}>{restaurant.description}</Text>
              ) : null}
              {restaurant.contact.phone ? (
                <a
                  className={cn(buttonClasses({ size: "lg" }), classes.button)}
                  href={`tel:${restaurant.contact.phone.replace(/[^+\d]/g, "")}`}
                >
                  Call {restaurant.contact.phone}
                </a>
              ) : null}
            </Stack>
          </Section>
        </Container>
      </div>
      <Container>
        <MenuSection menu={restaurant.menu} accent={accent} layout={menuLayout} />
        <Section aria-label="Opening hours">
          <Stack>
            <Heading level={2} className={classes.heading}>
              Open now? Check the hours
            </Heading>
            <HoursList hours={restaurant.hours} />
          </Stack>
        </Section>
        <VisitSection restaurant={restaurant} accent={accent} title="Find us" showHours={false} />
      </Container>
    </>
  );
}
