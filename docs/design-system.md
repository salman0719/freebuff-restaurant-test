# Design system

How the product looks: the token layer, the shared primitives, and the
theme system. Written for whoever changes the UI next.

## Tokens

`src/app/globals.css` is the single source of truth. It defines:

- **Semantic surfaces** — `--background`, `--foreground`, `--surface`,
  `--surface-muted`, `--border`, `--muted-foreground`, `--ring`. These are
  what app chrome (dashboard, auth, states) uses, via utilities such as
  `bg-surface`, `border-border`, `text-muted-foreground`.
- **Brand ramp** — `--brand-50` … `--brand-950`, a warm amber. Stable across
  light and dark so `bg-brand-600 text-white` reads correctly in both.
- **Elevation and radii** — warm-tinted shadows and softer radii, so
  `shadow-md` and `rounded-xl` already carry the house style.

Dark mode is **class-based** (`.dark` on `<html>`) rather than a media
query, so it can be toggled. `next-themes` owns the class
(`src/components/theme-provider.tsx`) and the default follows the system
preference; `ThemeToggle` is the control.

**Rule:** never hardcode a palette colour in app chrome. If a surface needs
a new role, add a semantic token here rather than reaching for `zinc-500`.

## Primitives

All in `src/components/ui`, all re-exported from `index.ts`:

| Primitive                                         | Use                                                            |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `Button` / `buttonClasses`                        | Actions. `buttonClasses` styles links as buttons.              |
| `Card`, `CardTitle`, `CardContent`                | Grouped content. `interactive` adds a hover lift.              |
| `Badge`                                           | Status pills (`neutral`/`brand`/`success`/`warning`/`danger`). |
| `Stat`                                            | Dashboard metric tiles.                                        |
| `PageHeader`                                      | Page intro: eyebrow, title, description, actions.              |
| `FormActions`                                     | Sticky bar holding an editor's primary action.                 |
| `Field`, `Input`, `Select`, `Textarea`, `Label`   | Forms. `Field` wires label, hint, and error.                   |
| `EmptyState`, `ErrorState`, `Spinner`, `Skeleton` | Feedback. `EmptyState` takes an optional `icon`.               |
| `Container`, `Section`, `Stack`                   | Layout rhythm.                                                 |
| `Heading`, `Text`, `Eyebrow`                      | Type scale. Headings 1–2 use the display serif.                |

`cn()` wraps `tailwind-merge`, so a caller's class wins over a component
default instead of producing two conflicting utilities.

## Themes

`src/themes/` renders tenant sites. A theme receives exactly one prop shape
(`ThemeProps`: the validated `PublicRestaurant` view plus resolved config),
never the database or session — a guard test fails the build if a theme
imports either.

- `registry.ts` — the only place a theme is chosen. Unknown or retired ids
  fall back to café rather than crashing.
- `sections.tsx` — shared `HeroSection`, `MenuSection`, `VisitSection` plus
  the `ACCENTS` palettes. Themes compose these; content mapping lives here
  once.
- `config.ts` — per-theme Zod schemas with defaults. **New options never
  need a migration**: stored JSON is validated defensively at render, so a
  missing or stale key yields a complete valid config.
- `cafe.tsx`, `takeaway.tsx`, `bistro.tsx`, `diner.tsx`, `garden.tsx` —
  the shipped themes (see `docs/decisions/0004` for the appearance round).
  Each has a direction name: café is **Modern Trattoria** (warm inks, and
  a left-aligned hero that hands straight to the menu), takeaway is
  **Night Market** (near-black bands, one call to order, a dense menu),
  diner is **Diner Revival**, and `garden` is **Market Garden** — the
  first cool-palette family (green/teal on slate), an asymmetric hero and
  a two-column menu/visit split, plus the `From the market this week`
  module derived from the tenant's own menu.

### Diner-specific assets

The Diner Revival theme (`diner`) owns three things no other theme uses:

- **Ramps** — `--color-cherry-*`, `--color-butter-*`, `--color-cola-*` in
  `globals.css` (Tailwind has no brown scale). Authored in OKLCH, every
  accent pair contrast-verified at AA before landing.
- **Display face** — Caprasimo, registered once in the root layout as
  `--font-caprasimo`; the diner wrapper swaps `--display-font` to it
  (the `:root` token behind the `font-display` utility — swap the token,
  not the utility class). Themes pick display faces by overriding
  `--display-font`, never by loading fonts themselves.
- **Awning crown** — `cherry-700`/`butter-400` stripes at the top of the
  page, accent-independent diner identity.

An **accent is a whole palette**, not a text colour: it tints the page
surface, paints the hero band, colours the CTA, and draws the accent rules.

### Contrast guard

`src/themes/contrast.test.ts` is the gate on colour. It resolves every
palette in `ACCENTS` to real sRGB values — reading Tailwind's shipped
palette and this project's `globals.css` ramps, i.e. the same files the
browser reads — and asserts every foreground/background pair clears WCAG AA
(4.5:1 for text, light and dark; 3:1 for the decorative rule).

It is automatic: a new accent added to `ACCENTS` is covered with no test
change, and a theme whose accent list names a palette that does not exist
fails. Change a ramp or a band colour and run `npm run test:run` before
believing an accent is fine by eye.

### Static class strings

Accent and layout values are looked up in explicit maps of literal class
strings. Never interpolate an option value into a class name
(`` `bg-${accent}-600` ``) — Tailwind scans source text, so a computed class
is never generated.

### Adding a theme

1. Add the id to `THEME_IDS` in `db/constants.ts`. `Record<ThemeId, …>`
   then fails to compile until every consumer (config schemas, accent
   lists, toggle, registry) knows the new id — that is the checklist.
2. Widen the `tenants_theme_allowed` CHECK in `db/schema.ts`, then
   `npm run db:generate` and `npm run db:migrate`. This is the one theme
   change that needs a migration — and only if the id is not already in
   the CHECK. Decision 0004 widened it once for `diner` _and_ `garden`, so
   garden shipped with no migration at all; a CHECK is allowed to run
   ahead of the app as long as the id eventually arrives.
3. Add accents to `ACCENTS` in `sections.tsx` and a schema in `config.ts`.
4. Write the component and register it in `registry.ts`.
5. Extend the `describe.each` in `themes.test.tsx` — that suite asserts the
   shared content model, images, empty states, accent application, and menu
   layout for every theme.

Palettes need no extra step: `contrast.test.ts` picks up new accents
(and new themes' accent lists) from `ACCENTS` and `accentsFor` on its own.

## Verifying appearance changes

```bash
npm run check          # lint + typecheck + format
npm run test:run       # unit + theme tests (live DB tests need TEST_DATABASE_URL)
npm run build          # required for user-facing changes
npm run test:e2e       # owner journey through the real dashboard
```

The public site is host-resolved, so a local check needs a `Host` header:

```bash
curl -H "Host: <slug>.localhost" http://localhost:4030/
```

`npm run db:seed` is idempotent and converges each demo tenant's look, so
switch a tenant's theme for experiments and re-run the seed to restore it.
It also seeds the appearance round's demos (`rosies-diner` for Diner
Revival, `the-greenhouse` for Market Garden) so every look is inspectable
in a real browser instead of through a preview harness.

Appearance changes also get a **real-browser pass** before sign-off. Drive
the seeded tenants through Chromium — Playwright is already a dependency —
at mobile and desktop widths, in light and dark, and assert what the
rendered page actually does: no horizontal overflow, no clipped text on
long menu items, no broken or missing images, tap targets ≥ 24 px, one `h1`
with no skipped heading levels, and rendered text contrast ≥ 4.5:1 from the
_computed_ colours. Resolve those colours by painting them on a canvas:
Chrome serialises this project's oklch palette as `lab(…)`, so a string
parser that only understands `rgb()` will fall through to the wrong
ancestor background and report false failures. Empty states get their own
throwaway published tenant with no profile, hours, or menu — publishing
before adding content is a real owner state, and every section must still
render its empty copy.
