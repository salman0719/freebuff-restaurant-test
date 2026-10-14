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
import { accentClasses, MenuSection, VisitSection } from "./sections";
import type { ThemeProps } from "./types";

/**
 * Takeaway theme — Night Market (Phase 2.4, refreshed in the 0004 appearance
 * round). Bold and high-contrast: a near-black accent hero band with the one
 * call-to-order CTA, a light strip under it like a row of stall lights, then
 * the dense dotted-leader menu.
 *
 * The refresh answers the appearance round's research notes. There is one
 * call to action and one imperative heading on the page — the hero's `tel:`
 * link — where the theme used to raise a second shouty heading
 * ("Open now? Check the hours") between the menu and the contact block;
 * hours now sit inside that block, under one "Find us" heading, so the menu
 * keeps the visitor's attention and the rest of the page is scannable in
 * two blocks instead of three.
 *
 * Same content model as café, composed from the same sections — only order,
 * density, and palette differ. No ordering or payment features: the CTA is
 * a plain `tel:` contact link.
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
      {/* Stall lights: the accent runs the full width under the band. */}
      <div aria-hidden="true" className={cn("h-1 w-full", classes.rule)} />
      <Container>
        <MenuSection menu={restaurant.menu} accent={accent} layout={menuLayout} />
        <VisitSection restaurant={restaurant} accent={accent} title="Find us" showHours />
      </Container>
    </>
  );
}
