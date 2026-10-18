/**
 * Composable theme sections (Phase 2.3; full accent palettes in Phase C).
 *
 * Themes compose these blocks instead of copy-pasting content rules:
 * `HeroSection` (identity), `MenuSection` (categories + items),
 * `VisitSection` (hours + contact). Each theme chooses order, alignment,
 * and accent — the content mapping lives here exactly once.
 *
 * An accent is a whole palette, not a text colour: it tints the page
 * surface, paints the hero band, colours the CTA, and draws the accent
 * rules. Class strings are explicit and static per value so Tailwind
 * generates them; option values are NEVER interpolated into class names.
 */
import Image from "next/image";
import { cn, Eyebrow, Heading, Section, Stack, Text } from "@/components/ui";
import { imageUrlForKey } from "@/lib/image-url";
import type { PublicMenuCategory, PublicRestaurant } from "@/lib/restaurant";
import type { MenuLayout } from "./config";
import { formatPrice } from "./format";
import { HoursList } from "./hours";

export interface AccentPalette {
  /** Kicker text above headings, on the page surface. */
  eyebrow: string;
  /** Section/hero heading on the page surface. */
  heading: string;
  /** Page background tint. */
  surface: string;
  /** Hero band background. */
  band: string;
  /** Heading text inside the band. */
  bandText: string;
  /** Kicker text inside the band. */
  bandEyebrow: string;
  /** Body copy inside the band. */
  bandBody: string;
  /** Primary call-to-action fill (composed over the shared button base). */
  button: string;
  /** Short decorative rule under headings. */
  rule: string;
}

/** Static accent map — every class must appear literally for Tailwind. */
export const ACCENTS: Record<string, AccentPalette> = {
  // Café's trio is Modern Trattoria: three warm inks (espresso, terracotta,
  // tomato) over the house cream. The old `forest` emerald was the one cool
  // accent in the set and left with the refresh.
  espresso: {
    eyebrow: "text-amber-800 dark:text-amber-200",
    heading: "text-stone-900 dark:text-stone-50",
    surface: "bg-amber-50/70 dark:bg-stone-950",
    band: "bg-amber-950",
    bandText: "text-amber-50",
    bandEyebrow: "text-amber-200",
    bandBody: "text-amber-100",
    button: "bg-amber-800 text-white hover:bg-amber-900",
    rule: "bg-amber-700",
  },
  terracotta: {
    eyebrow: "text-orange-800 dark:text-orange-200",
    heading: "text-stone-900 dark:text-stone-50",
    surface: "bg-orange-50/70 dark:bg-stone-950",
    band: "bg-orange-950",
    bandText: "text-orange-50",
    bandEyebrow: "text-orange-200",
    bandBody: "text-orange-100",
    button: "bg-orange-800 text-white hover:bg-orange-900",
    rule: "bg-orange-700",
  },
  tomato: {
    eyebrow: "text-red-800 dark:text-red-200",
    heading: "text-stone-900 dark:text-stone-50",
    surface: "bg-red-50/70 dark:bg-stone-950",
    band: "bg-red-900",
    bandText: "text-red-50",
    bandEyebrow: "text-red-200",
    bandBody: "text-red-100",
    button: "bg-red-700 text-white hover:bg-red-800",
    rule: "bg-red-600",
  },
  // Takeaway's trio is Night Market: deep, near-black bands with the accent
  // doing the work of stall light. Every band dropped a step or two so the
  // page reads after dark while the light text gains contrast.
  chili: {
    eyebrow: "text-red-700 dark:text-red-300",
    heading: "text-zinc-950 dark:text-zinc-50",
    surface: "bg-red-50/60 dark:bg-zinc-950",
    band: "bg-red-950",
    bandText: "text-red-50",
    bandEyebrow: "text-red-200",
    bandBody: "text-red-100",
    button: "bg-red-600 text-white hover:bg-red-700",
    rule: "bg-red-600",
  },
  charcoal: {
    eyebrow: "text-zinc-600 dark:text-zinc-300",
    heading: "text-zinc-950 dark:text-zinc-50",
    surface: "bg-zinc-50 dark:bg-zinc-950",
    band: "bg-zinc-950",
    bandText: "text-zinc-50",
    bandEyebrow: "text-zinc-300",
    bandBody: "text-zinc-300",
    button: "bg-zinc-800 text-white hover:bg-zinc-900",
    rule: "bg-zinc-600",
  },
  // yellow-600 fills could not carry light text (2.7–2.9:1) nor a 3:1 rule;
  // the band/button/rule steps moved darker so the palette clears AA, which
  // the contrast guard now enforces (`contrast.test.ts`).
  gold: {
    eyebrow: "text-yellow-700 dark:text-yellow-300",
    heading: "text-zinc-950 dark:text-zinc-50",
    surface: "bg-yellow-50/70 dark:bg-zinc-950",
    band: "bg-yellow-900",
    bandText: "text-yellow-50",
    bandEyebrow: "text-yellow-200",
    bandBody: "text-yellow-50",
    button: "bg-yellow-700 text-white hover:bg-yellow-800",
    rule: "bg-yellow-700",
  },
  plum: {
    eyebrow: "text-purple-800 dark:text-purple-200",
    heading: "text-stone-900 dark:text-stone-50",
    surface: "bg-purple-50/60 dark:bg-stone-950",
    band: "bg-purple-900",
    bandText: "text-purple-50",
    bandEyebrow: "text-purple-200",
    bandBody: "text-purple-100",
    button: "bg-purple-800 text-white hover:bg-purple-900",
    rule: "bg-purple-700",
  },
  navy: {
    eyebrow: "text-blue-800 dark:text-blue-200",
    heading: "text-stone-900 dark:text-stone-50",
    surface: "bg-blue-50/60 dark:bg-slate-950",
    band: "bg-slate-900",
    bandText: "text-slate-50",
    bandEyebrow: "text-sky-200",
    bandBody: "text-slate-200",
    button: "bg-slate-800 text-white hover:bg-slate-900",
    rule: "bg-sky-700",
  },
  sage: {
    eyebrow: "text-lime-800 dark:text-lime-200",
    heading: "text-stone-900 dark:text-stone-50",
    surface: "bg-lime-50/60 dark:bg-stone-950",
    band: "bg-lime-900",
    bandText: "text-lime-50",
    bandEyebrow: "text-lime-200",
    bandBody: "text-lime-100",
    button: "bg-lime-800 text-white hover:bg-lime-900",
    rule: "bg-lime-700",
  },
  // --- Diner Revival (0004): cherry/butter/cola ramps from globals.css ---
  cherry: {
    eyebrow: "text-cherry-800 dark:text-cherry-200",
    heading: "text-stone-900 dark:text-stone-50",
    surface: "bg-cherry-50/70 dark:bg-stone-950",
    band: "bg-cherry-700",
    bandText: "text-cherry-50",
    bandEyebrow: "text-cherry-200",
    bandBody: "text-cherry-100",
    button: "bg-cherry-600 text-white hover:bg-cherry-700",
    rule: "bg-cherry-600",
  },
  butter: {
    eyebrow: "text-cherry-700 dark:text-butter-300",
    heading: "text-stone-900 dark:text-stone-50",
    surface: "bg-butter-50/70 dark:bg-stone-950",
    // Light band under dark text — the first of its kind in ACCENTS and
    // the diner signature move (contrast verified, see 0004).
    band: "bg-butter-400",
    bandText: "text-cola-950",
    bandEyebrow: "text-cola-700",
    bandBody: "text-cola-800",
    button: "bg-cherry-600 text-white hover:bg-cherry-700",
    rule: "bg-cherry-500",
  },
  cola: {
    eyebrow: "text-cola-700 dark:text-butter-300",
    heading: "text-stone-900 dark:text-stone-50",
    surface: "bg-cola-50/70 dark:bg-cola-950",
    band: "bg-cola-900",
    bandText: "text-cola-50",
    bandEyebrow: "text-butter-300",
    bandBody: "text-cola-100",
    button: "bg-cherry-600 text-white hover:bg-cherry-700",
    rule: "bg-cherry-500",
  },
  // --- Market Garden (0004): the first cool family — green/teal on slate ---
  fern: {
    eyebrow: "text-green-800 dark:text-green-200",
    heading: "text-slate-900 dark:text-slate-50",
    surface: "bg-green-50/70 dark:bg-slate-950",
    band: "bg-green-900",
    bandText: "text-green-50",
    bandEyebrow: "text-green-200",
    bandBody: "text-green-100",
    button: "bg-green-800 text-white hover:bg-green-900",
    rule: "bg-green-600",
  },
  brook: {
    eyebrow: "text-teal-800 dark:text-teal-200",
    heading: "text-slate-900 dark:text-slate-50",
    surface: "bg-teal-50/70 dark:bg-slate-950",
    band: "bg-teal-900",
    bandText: "text-teal-50",
    bandEyebrow: "text-teal-200",
    bandBody: "text-teal-100",
    button: "bg-teal-800 text-white hover:bg-teal-900",
    rule: "bg-teal-600",
  },
  celery: {
    eyebrow: "text-teal-800 dark:text-teal-200",
    heading: "text-slate-900 dark:text-slate-50",
    surface: "bg-teal-50/60 dark:bg-slate-950",
    // The second light band under dark text (butter was the first): a pale
    // celery strip, which is how a market stall reads without going dark.
    band: "bg-green-200",
    bandText: "text-green-950",
    bandEyebrow: "text-green-800",
    bandBody: "text-green-900",
    button: "bg-teal-800 text-white hover:bg-teal-900",
    rule: "bg-teal-700",
  },
  default: {
    eyebrow: "text-zinc-600 dark:text-zinc-300",
    heading: "text-zinc-950 dark:text-zinc-50",
    surface: "bg-zinc-50 dark:bg-zinc-950",
    band: "bg-zinc-900",
    bandText: "text-zinc-50",
    bandEyebrow: "text-zinc-300",
    bandBody: "text-zinc-300",
    button: "bg-zinc-800 text-white hover:bg-zinc-900",
    rule: "bg-zinc-700",
  },
};

/** Static palette set for the takeaway brand direction picker. */
export const TAKEAWAY_DIRECTIONS = {
  smokehouse: {
    surface: "bg-zinc-950 text-zinc-50",
    ink: "text-zinc-50",
    muted: "text-zinc-300",
    panel: "bg-zinc-900",
    border: "border-zinc-700",
    highlight: "text-amber-300",
    button: "bg-amber-300 text-zinc-950 hover:bg-amber-200",
    badge: "bg-zinc-800 text-amber-200",
    stripe: "bg-amber-300",
  },
  "drive-in": {
    surface: "bg-butter-50 text-cola-950",
    ink: "text-cola-950",
    muted: "text-cola-800",
    panel: "bg-white",
    border: "border-butter-300",
    highlight: "text-cherry-700",
    button: "bg-cherry-700 text-white hover:bg-cherry-800",
    badge: "bg-butter-200 text-cola-950",
    stripe: "bg-cherry-600",
  },
  modern: {
    surface: "bg-slate-50 text-slate-950",
    ink: "text-slate-950",
    muted: "text-slate-600",
    panel: "bg-white",
    border: "border-slate-200",
    highlight: "text-blue-700",
    button: "bg-blue-700 text-white hover:bg-blue-800",
    badge: "bg-blue-50 text-blue-800",
    stripe: "bg-blue-700",
  },
} as const;

/** Never throws: an unknown accent (stale database value) falls back. */
export function accentClasses(accent: string): AccentPalette {
  return ACCENTS[accent] ?? ACCENTS.default;
}

/** Short decorative rule that anchors a heading to its accent. */
function AccentRule({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn("h-1 w-12 rounded-full", className)} />;
}

export function HeroSection({
  restaurant,
  kicker,
  accent,
  align = "center",
  showDescription = true,
  className,
}: {
  restaurant: PublicRestaurant;
  kicker: string;
  accent: string;
  align?: "center" | "left";
  showDescription?: boolean;
  /** Extra classes on the section, for tightening the hand-off to the menu. */
  className?: string;
}): React.ReactElement {
  const classes = accentClasses(accent);
  return (
    <Section aria-label="Restaurant introduction" className={className}>
      <Stack className={align === "center" ? "items-center text-center" : "items-start text-left"}>
        {restaurant.logoImageKey ? (
          <Image
            src={imageUrlForKey(restaurant.logoImageKey)}
            alt={`${restaurant.name} logo`}
            width={96}
            height={96}
            // First-screen identity, and on several themes the largest thing
            // on it — measured as the LCP element. `priority` preloads it and
            // drops `loading="lazy"` so it no longer waits for lazy discovery.
            priority
            className="rounded-2xl object-contain"
          />
        ) : null}
        <Eyebrow className={classes.eyebrow}>{kicker}</Eyebrow>
        <AccentRule className={classes.rule} />
        <Heading level={1} className={classes.heading}>
          {restaurant.name}
        </Heading>
        {showDescription && restaurant.description ? <Text>{restaurant.description}</Text> : null}
      </Stack>
    </Section>
  );
}

/**
 * Item thumbnail. Renders nothing without a photo, so text-only menus
 * keep their exact layout; empty `alt` because the item name sits right
 * beside it.
 */
function ItemPhoto({ imageKey, size }: { imageKey: string | null; size: number }) {
  if (!imageKey) return null;
  return (
    <Image
      src={imageUrlForKey(imageKey)}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-lg object-cover"
    />
  );
}

export type SectionPalette = Pick<AccentPalette, "eyebrow" | "heading" | "rule"> & {
  item?: string;
  muted?: string;
  panel?: string;
  border?: string;
};

export function MenuSection({
  menu,
  accent,
  heading = "Menu",
  emptyText = "Our menu is coming soon — please check back later.",
  layout = "editorial",
  palette,
}: {
  menu: PublicMenuCategory[];
  accent: string;
  heading?: string;
  emptyText?: string;
  /** Editorial (spacious), compact (dense dotted rows), or grid (cards). */
  layout?: MenuLayout;
  /** Theme-specific semantic colors for branded variants. */
  palette?: SectionPalette;
}): React.ReactElement {
  const classes = accentClasses(accent);
  const headingClass = palette?.heading ?? classes.heading;
  const ruleClass = palette?.rule ?? classes.rule;
  const itemClass = palette?.item ?? "text-foreground";
  const mutedClass = palette?.muted;
  const panelClass = palette?.panel ?? "bg-surface";
  const borderClass = palette?.border ?? "border-border";
  const leaderClass = palette?.border ?? "border-border";
  return (
    <Section aria-label={heading}>
      <Stack>
        <Heading level={2} className={headingClass}>
          {heading}
        </Heading>
        <AccentRule className={ruleClass} />
        {menu.length === 0 ? (
          <Text className={mutedClass}>{emptyText}</Text>
        ) : layout === "compact" ? (
          menu.map((category) => (
            <section key={category.id} aria-label={category.name}>
              <Heading level={3} className={headingClass}>
                {category.name}
              </Heading>
              <ul>
                {category.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 py-1.5">
                    <ItemPhoto imageKey={item.imageKey} size={56} />
                    <div className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-base font-medium ${itemClass}`}>{item.name}</span>
                        <span
                          aria-hidden="true"
                          className={`mx-1 flex-1 border-b border-dotted ${leaderClass}`}
                        />
                        <span className={`text-base font-semibold tabular-nums ${itemClass}`}>
                          {formatPrice(item.priceCents)}
                        </span>
                      </span>
                      {item.description ? (
                        <Text size="sm" muted className={mutedClass}>
                          {item.description}
                        </Text>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : layout === "grid" ? (
          menu.map((category) => (
            <section key={category.id} aria-label={category.name}>
              <Heading level={3} className={headingClass}>
                {category.name}
              </Heading>
              {category.description ? (
                <Text muted className={mutedClass}>
                  {category.description}
                </Text>
              ) : null}
              <ul className="grid gap-3 sm:grid-cols-2">
                {category.items.map((item) => (
                  <li
                    key={item.id}
                    className={`flex gap-3 rounded-xl border p-4 shadow-sm ${borderClass} ${panelClass}`}
                  >
                    <ItemPhoto imageKey={item.imageKey} size={56} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline justify-between gap-2">
                        <span className={`text-base font-medium ${itemClass}`}>{item.name}</span>
                        <span className={`text-base font-semibold tabular-nums ${itemClass}`}>
                          {formatPrice(item.priceCents)}
                        </span>
                      </p>
                      {item.description ? (
                        <Text size="sm" muted className={mutedClass}>
                          {item.description}
                        </Text>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          menu.map((category) => (
            <section key={category.id} aria-label={category.name}>
              <Heading level={3} className={headingClass}>
                {category.name}
              </Heading>
              {category.description ? (
                <Text muted className={mutedClass}>
                  {category.description}
                </Text>
              ) : null}
              <ul>
                {category.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <ItemPhoto imageKey={item.imageKey} size={64} />
                    <div className="min-w-0 flex-1">
                      <Text className={itemClass}>
                        {item.name} — {formatPrice(item.priceCents)}
                      </Text>
                      {item.description ? (
                        <Text muted className={mutedClass}>
                          {item.description}
                        </Text>
                      ) : null}
                    </div>
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
  title = "Visit us",
  palette,
  className,
}: {
  restaurant: PublicRestaurant;
  accent: string;
  showHours?: boolean;
  title?: string;
  palette?: SectionPalette;
  className?: string;
}): React.ReactElement {
  const classes = accentClasses(accent);
  const headingClass = palette?.heading ?? classes.heading;
  const ruleClass = palette?.rule ?? classes.rule;
  const mutedClass = palette?.muted;
  const address = [restaurant.address.line1, restaurant.address.city, restaurant.address.country]
    .filter(Boolean)
    .join(", ");
  const hasContact = restaurant.contact.phone || restaurant.contact.email || address;
  return (
    <Section aria-label={title} className={className}>
      <Stack>
        <Heading level={2} className={headingClass}>
          {title}
        </Heading>
        <AccentRule className={ruleClass} />
        {showHours ? <HoursList hours={restaurant.hours} className={palette?.item} /> : null}
        {!hasContact ? (
          <Text muted className={mutedClass}>
            Contact details coming soon.
          </Text>
        ) : (
          <address>
            {restaurant.contact.phone ? (
              <Text className={palette?.item}>{restaurant.contact.phone}</Text>
            ) : null}
            {restaurant.contact.email ? (
              <Text className={palette?.item}>{restaurant.contact.email}</Text>
            ) : null}
            {address ? <Text className={palette?.item}>{address}</Text> : null}
          </address>
        )}
      </Stack>
    </Section>
  );
}
