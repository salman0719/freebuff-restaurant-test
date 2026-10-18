import Image from "next/image";
import { Caprasimo } from "next/font/google";
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
import type { DinerConfig } from "./config";
import { accentClasses, MenuSection, VisitSection } from "./sections";
import type { ThemeProps } from "./types";

/**
 * Diner theme (0004 — Diner Revival). Retro comfort food: an awning-stripe
 * crown, a centred hero with a ring-framed logo, the menu presented as a
 * framed "menu board", and a full-bleed band strip carrying the
 * call-to-order CTA (a plain `tel:` link — no ordering, same rule as
 * takeaway). The wrapper swaps `--display-font` to Caprasimo, the retro
 * face registered here (only diner pages ever download its 20 KB file);
 * body copy stays Geist.
 *
 * Same content model and shared sections as every other theme — only the
 * arrangement, density, and palette differ.
 */
/**
 * Cooper-style serif based on Fraunces, so it harmonises with the house
 * display face. Libre/OFL via Google Fonts. Scoped to this wrapper and
 * deliberately not preloaded: the registry imports every theme component
 * into every public page, so a preloaded face here would still be fetched
 * by the four themes that never render it. The @font-face stays in the
 * shared CSS, so a diner page downloads the 20 KB file on demand behind
 * the metric-matched fallback — the same swap every non-preloaded face
 * already does.
 */
const caprasimo = Caprasimo({
  variable: "--font-caprasimo",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export function DinerTheme({ restaurant, config }: ThemeProps): React.ReactElement {
  const { accent, menuLayout, showHours } = config as DinerConfig;
  const classes = accentClasses(accent);
  const phone = restaurant.contact.phone;
  return (
    <div
      className={cn(classes.surface, caprasimo.variable, "[--display-font:var(--font-caprasimo)]")}
    >
      {/* Awning crown: the diner's fixed red/cream identity, accent-independent. */}
      <div aria-hidden="true" className="h-3 bg-cherry-700" />
      <div aria-hidden="true" className="h-3 bg-butter-400" />

      <Container>
        <Section aria-label="Restaurant introduction">
          <Stack className="items-center text-center">
            {restaurant.logoImageKey ? (
              <Image
                src={imageUrlForKey(restaurant.logoImageKey)}
                alt={`${restaurant.name} logo`}
                width={112}
                height={112}
                // Hero identity image: first screen on every theme, so eager
                // and preloaded instead of lazy (Phase 6.3).
                priority
                className="rounded-full object-contain ring-4 ring-cherry-600"
              />
            ) : null}
            <Eyebrow className={classes.eyebrow}>Diner</Eyebrow>
            <span aria-hidden="true" className={cn("h-1 w-12 rounded-full", classes.rule)} />
            <Heading level={1} className={classes.heading}>
              {restaurant.name}
            </Heading>
            {restaurant.description ? <Text>{restaurant.description}</Text> : null}
          </Stack>
        </Section>

        {/* The menu board: a framed card, like the board on the wall. */}
        <div className="mb-4 rounded-2xl border-2 border-border bg-surface p-4 shadow-md sm:p-6">
          <MenuSection menu={restaurant.menu} accent={accent} layout={menuLayout} />
        </div>
      </Container>

      {phone ? (
        <div className={classes.band}>
          <Container>
            <Section aria-label="Call to order">
              <Stack className="items-center text-center">
                <Heading level={2} className={classes.bandText}>
                  Hungry? Call ahead
                </Heading>
                <a
                  className={cn(buttonClasses({ size: "lg" }), classes.button)}
                  href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                >
                  Call {phone}
                </a>
              </Stack>
            </Section>
          </Container>
        </div>
      ) : null}

      <Container>
        <VisitSection restaurant={restaurant} accent={accent} showHours={showHours} />
      </Container>
    </div>
  );
}
