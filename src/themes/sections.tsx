/**
 * Composable theme sections (Phase 2.3, extensibility move 2).
 *
 * Themes compose these blocks instead of copy-pasting content rules:
 * `HeroSection` (identity), `MenuSection` (categories + items),
 * `VisitSection` (hours + contact). Each theme chooses order, alignment,
 * and accent — the content mapping lives here exactly once.
 *
 * Accent classes are explicit static strings per option value so Tailwind
 * generates them; option values are NEVER interpolated into class names.
 */
import { Eyebrow, Heading, Section, Stack, Text } from "@/components/ui";
import type { PublicMenuCategory, PublicRestaurant } from "@/lib/restaurant";
import { formatPrice } from "./format";
import { HoursList } from "./hours";

type Accent = "espresso" | "forest" | "terracotta" | "chili" | "charcoal" | "gold" | "default";

/** Static accent map — every key must appear literally for Tailwind. */
export const ACCENTS: Record<Accent, { eyebrow: string; heading: string }> = {
  espresso: {
    eyebrow: "text-amber-800 dark:text-amber-200",
    heading: "text-stone-900 dark:text-stone-50",
  },
  forest: {
    eyebrow: "text-green-800 dark:text-green-200",
    heading: "text-stone-900 dark:text-stone-50",
  },
  terracotta: {
    eyebrow: "text-orange-800 dark:text-orange-200",
    heading: "text-stone-900 dark:text-stone-50",
  },
  chili: { eyebrow: "text-red-700 dark:text-red-300", heading: "text-zinc-950 dark:text-zinc-50" },
  charcoal: {
    eyebrow: "text-zinc-600 dark:text-zinc-300",
    heading: "text-zinc-950 dark:text-zinc-50",
  },
  gold: {
    eyebrow: "text-yellow-700 dark:text-yellow-300",
    heading: "text-zinc-950 dark:text-zinc-50",
  },
  default: {
    eyebrow: "text-zinc-600 dark:text-zinc-300",
    heading: "text-zinc-950 dark:text-zinc-50",
  },
};

export function accentClasses(accent: string): { eyebrow: string; heading: string } {
  return ACCENTS[accent as Accent] ?? ACCENTS.default;
}

export function HeroSection({
  restaurant,
  kicker,
  accent,
  align = "center",
  showDescription = true,
}: {
  restaurant: PublicRestaurant;
  kicker: string;
  accent: string;
  align?: "center" | "left";
  showDescription?: boolean;
}): React.ReactElement {
  const classes = accentClasses(accent);
  return (
    <Section aria-label="Restaurant introduction">
      <Stack className={align === "center" ? "items-center text-center" : "items-start text-left"}>
        <Eyebrow className={classes.eyebrow}>{kicker}</Eyebrow>
        <Heading level={1} className={classes.heading}>
          {restaurant.name}
        </Heading>
        {showDescription && restaurant.description ? <Text>{restaurant.description}</Text> : null}
      </Stack>
    </Section>
  );
}

export function MenuSection({
  menu,
  accent,
  heading = "Menu",
  emptyText = "Our menu is coming soon — please check back later.",
}: {
  menu: PublicMenuCategory[];
  accent: string;
  heading?: string;
  emptyText?: string;
}): React.ReactElement {
  const classes = accentClasses(accent);
  return (
    <Section aria-label={heading}>
      <Stack>
        <Heading level={2} className={classes.heading}>
          {heading}
        </Heading>
        {menu.length === 0 ? (
          <Text>{emptyText}</Text>
        ) : (
          menu.map((category) => (
            <section key={category.id} aria-label={category.name}>
              <Heading level={3}>{category.name}</Heading>
              {category.description ? <Text>{category.description}</Text> : null}
              <ul>
                {category.items.map((item) => (
                  <li key={item.id}>
                    <Text>
                      {item.name} — {formatPrice(item.priceCents)}
                    </Text>
                    {item.description ? <Text>{item.description}</Text> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </Stack>
    </Section>
  );
}

export function VisitSection({
  restaurant,
  accent,
  showHours = true,
}: {
  restaurant: PublicRestaurant;
  accent: string;
  showHours?: boolean;
}): React.ReactElement {
  const classes = accentClasses(accent);
  const address = [restaurant.address.line1, restaurant.address.city, restaurant.address.country]
    .filter(Boolean)
    .join(", ");
  const hasContact = restaurant.contact.phone || restaurant.contact.email || address;
  return (
    <Section aria-label="Visit us">
      <Stack>
        <Heading level={2} className={classes.heading}>
          Visit us
        </Heading>
        {showHours ? <HoursList hours={restaurant.hours} /> : null}
        {!hasContact ? (
          <Text>Contact details coming soon.</Text>
        ) : (
          <address>
            {restaurant.contact.phone ? <Text>{restaurant.contact.phone}</Text> : null}
            {restaurant.contact.email ? <Text>{restaurant.contact.email}</Text> : null}
            {address ? <Text>{address}</Text> : null}
          </address>
        )}
      </Stack>
    </Section>
  );
}
