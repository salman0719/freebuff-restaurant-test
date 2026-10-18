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
import { formatHours, weekdayName } from "./hours";
import type { TakeawayConfig } from "./config";
import { TAKEAWAY_DIRECTIONS, accentClasses, MenuSection, VisitSection } from "./sections";
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
function telephoneHref(phone: string): string {
  return `tel:${phone.split(/[ ()-]/).join("")}`;
}

export function TakeawayTheme({ restaurant, config }: ThemeProps): React.ReactElement {
  const { accent, brandDirection, showDescription, menuLayout } = config as TakeawayConfig;
  const classes = accentClasses(accent);
  const direction = TAKEAWAY_DIRECTIONS[brandDirection];
  return (
    <main className={`min-h-screen ${direction.surface}`}>
      <div aria-hidden="true" className={`h-2 ${direction.stripe}`} />
      <header className="border-b border-current/10">
        <Container>
          <nav aria-label="Main" className="flex min-h-16 items-center justify-between gap-4 py-3">
            <a
              href="#top"
              className={`font-display text-lg font-bold tracking-tight ${direction.ink}`}
            >
              {restaurant.name}
            </a>
            <a
              href="#menu"
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${direction.button}`}
            >
              Explore menu <span aria-hidden="true">↓</span>
            </a>
          </nav>
        </Container>
      </header>
      <div id="top" className={`relative overflow-hidden ${direction.panel}`}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-36 size-[28rem] rounded-full border-[3rem] border-current/5"
        />
        <Container>
          <Section
            aria-label="Restaurant introduction"
            className="relative py-12 sm:py-20 lg:py-24"
          >
            <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
              <Stack className="items-start text-left">
                {restaurant.logoImageKey ? (
                  <Image
                    src={imageUrlForKey(restaurant.logoImageKey)}
                    alt=""
                    width={64}
                    height={64}
                    priority
                    className="size-14 rounded-xl object-contain"
                  />
                ) : null}
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${direction.badge}`}
                >
                  <span aria-hidden="true" className={`size-2 rounded-full ${direction.stripe}`} />
                  {brandDirection === "smokehouse"
                    ? "Made for the good stuff"
                    : brandDirection === "drive-in"
                      ? "Pull up hungry"
                      : "Good food, no fuss"}
                </span>
                <Eyebrow className={classes.bandEyebrow}>Fast, fresh &amp; made for you</Eyebrow>
                <Heading
                  level={1}
                  className={`max-w-3xl text-5xl leading-[0.98] sm:text-6xl lg:text-7xl ${direction.ink}`}
                >
                  {restaurant.name}
                </Heading>
                {showDescription && restaurant.description ? (
                  <Text className={`max-w-xl text-lg leading-8 ${direction.muted}`}>
                    {restaurant.description}
                  </Text>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <a
                    href="#menu"
                    className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 ${direction.button}`}
                  >
                    See what&apos;s cooking <span aria-hidden="true">↗</span>
                  </a>
                  {restaurant.contact.phone ? (
                    <a
                      className={cn(
                        buttonClasses({ size: "lg", variant: "outline" }),
                        `border-current/20 ${direction.ink}`
                      )}
                      href={telephoneHref(restaurant.contact.phone)}
                    >
                      Call us
                    </a>
                  ) : null}
                </div>
                <div
                  className={`mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium ${direction.muted}`}
                >
                  <span>Fast, friendly, satisfying</span>
                  <span aria-hidden="true">✦</span>
                  <span>Made fresh every day</span>
                </div>
              </Stack>
              {restaurant.logoImageKey ? (
                <div
                  className={`relative mx-auto w-full max-w-md rounded-[2rem] border p-3 shadow-2xl ${direction.border} ${direction.surface}`}
                >
                  <Image
                    src={imageUrlForKey(restaurant.logoImageKey)}
                    alt={`${restaurant.name} logo`}
                    width={640}
                    height={560}
                    priority
                    className="aspect-[5/4] w-full rounded-[1.5rem] object-cover"
                  />
                  <span
                    className={`absolute -bottom-4 -left-4 rounded-full px-5 py-3 text-sm font-bold shadow-lg ${direction.badge}`}
                  >
                    Your next favorite bite
                  </span>
                </div>
              ) : (
                <div
                  aria-hidden="true"
                  className={`mx-auto flex aspect-[5/4] w-full max-w-md items-center justify-center rounded-[2rem] border text-8xl ${direction.border} ${direction.surface}`}
                >
                  {brandDirection === "drive-in" ? "🍔" : brandDirection === "modern" ? "✳" : "🔥"}
                </div>
              )}
            </div>
          </Section>
        </Container>
      </div>
      <div aria-hidden="true" className={`h-2 ${direction.stripe}`} />
      <Container>
        <div id="menu" className="scroll-mt-6">
          <Section className="pb-2">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow className={direction.highlight}>The good stuff</Eyebrow>
                <Heading level={2} className={`mt-2 text-4xl sm:text-5xl ${direction.ink}`}>
                  Big flavor. No fuss.
                </Heading>
              </div>
              <p className={`max-w-sm text-sm leading-6 ${direction.muted}`}>
                Find your new favorite, from first bite to last.
              </p>
            </div>
          </Section>
          <div
            className={`rounded-[1.75rem] border p-4 shadow-xl sm:p-8 ${direction.border} ${direction.panel}`}
          >
            <MenuSection
              menu={restaurant.menu}
              accent={accent}
              layout={menuLayout}
              heading="On the menu"
              palette={{
                eyebrow: direction.highlight,
                heading: direction.ink,
                rule: direction.stripe,
                item: direction.ink,
                muted: direction.muted,
                panel: direction.panel,
                border: direction.border,
              }}
            />
          </div>
        </div>
        <div
          className={`my-10 overflow-hidden rounded-[1.75rem] border ${direction.border} ${direction.panel}`}
        >
          <div className={`h-2 ${direction.stripe}`} />
          <VisitSection
            restaurant={restaurant}
            accent={accent}
            title="Come on by"
            showHours
            className="px-6 py-8 sm:px-10 sm:py-10"
            palette={{
              eyebrow: direction.highlight,
              heading: direction.ink,
              rule: direction.stripe,
              item: direction.ink,
              muted: direction.muted,
              panel: direction.panel,
              border: direction.border,
            }}
          />
        </div>
      </Container>
      <footer className={`border-t ${direction.border} ${direction.panel}`}>
        <Container>
          <div className="grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
            <div className="flex flex-col gap-2">
              <p className={`font-display text-lg font-bold ${direction.ink}`}>{restaurant.name}</p>
              {restaurant.description ? (
                <p className={`max-w-xs text-sm leading-6 ${direction.muted}`}>
                  {restaurant.description}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <h2 className={`text-sm font-bold uppercase tracking-widest ${direction.highlight}`}>
                Visit
              </h2>
              <address
                className={`flex flex-col gap-1 text-sm not-italic leading-6 ${direction.muted}`}
              >
                {restaurant.address.line1 ? <span>{restaurant.address.line1}</span> : null}
                {restaurant.address.line2 ? <span>{restaurant.address.line2}</span> : null}
                {[
                  restaurant.address.city,
                  restaurant.address.postalCode,
                  restaurant.address.country,
                ].filter(Boolean).length > 0 ? (
                  <span>
                    {[
                      restaurant.address.city,
                      restaurant.address.postalCode,
                      restaurant.address.country,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                ) : null}
              </address>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className={`text-sm font-bold uppercase tracking-widest ${direction.highlight}`}>
                Contact
              </h2>
              {restaurant.contact.phone ? (
                <a
                  href={telephoneHref(restaurant.contact.phone)}
                  className={`w-fit text-sm font-medium underline-offset-4 hover:underline ${direction.ink}`}
                >
                  {restaurant.contact.phone}
                </a>
              ) : null}
              {restaurant.contact.email ? (
                <a
                  href={`mailto:${restaurant.contact.email}`}
                  className={`w-fit break-all text-sm font-medium underline-offset-4 hover:underline ${direction.ink}`}
                >
                  {restaurant.contact.email}
                </a>
              ) : null}
              {!restaurant.contact.phone && !restaurant.contact.email ? (
                <p className={`text-sm ${direction.muted}`}>Contact details coming soon.</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <h2 className={`text-sm font-bold uppercase tracking-widest ${direction.highlight}`}>
                Hours
              </h2>
              {restaurant.hours.length > 0 ? (
                <ul className={`flex flex-col gap-1 text-sm leading-6 ${direction.muted}`}>
                  {[...restaurant.hours]
                    .sort((a, b) => a.weekday - b.weekday)
                    .map((hour) => (
                      <li key={hour.weekday}>
                        {weekdayName(hour.weekday)}: {formatHours(hour)}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className={`text-sm ${direction.muted}`}>Opening hours coming soon.</p>
              )}
            </div>
          </div>
          <div
            className={`border-t ${direction.border} py-4 text-center text-xs ${direction.muted}`}
          >
            © {new Date().getFullYear()} {restaurant.name}. All rights reserved.
          </div>
        </Container>
      </footer>
    </main>
  );
}
