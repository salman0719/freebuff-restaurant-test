import { buttonClasses, Container, Eyebrow, Heading, Section, Stack, Text } from "@/components/ui";
import type { TakeawayConfig } from "./config";
import { HoursList } from "./hours";
import { MenuSection, VisitSection } from "./sections";
import type { ThemeProps } from "./types";

/**
 * Takeaway theme (Phase 2.4). Bold and high-contrast: a dark hero band with
 * a call-to-order CTA, a dense dotted-leader menu, and a compact find-us
 * strip. Same content model as café, composed from the same sections —
 * only order, density, and palette differ. No ordering or payment features:
 * the CTA is a plain `tel:` contact link.
 */
export function TakeawayTheme({ restaurant, config }: ThemeProps): React.ReactElement {
  const { accent, showDescription } = config as TakeawayConfig;
  return (
    <>
      <div className="bg-zinc-950 text-zinc-50 dark:bg-black">
        <Container>
          <Section aria-label="Restaurant introduction">
            <Stack className="items-start text-left">
              <Eyebrow className="text-red-300">Takeaway</Eyebrow>
              <Heading level={1} className="text-zinc-50">
                {restaurant.name}
              </Heading>
              {showDescription && restaurant.description ? (
                <Text className="text-zinc-300">{restaurant.description}</Text>
              ) : null}
              {restaurant.contact.phone ? (
                <a
                  className={buttonClasses({ variant: "danger", size: "lg" })}
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
        <MenuSection menu={restaurant.menu} accent={accent} layout="compact" />
        <Section aria-label="Opening hours">
          <Stack>
            <Heading level={2}>Open now? Check the hours</Heading>
            <HoursList hours={restaurant.hours} />
          </Stack>
        </Section>
        <VisitSection restaurant={restaurant} accent={accent} title="Find us" showHours={false} />
      </Container>
    </>
  );
}
