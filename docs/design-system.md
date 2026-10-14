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
- `cafe.tsx`, `takeaway.tsx`, `bistro.tsx`, `diner.tsx` — the shipped
  themes (see `docs/decisions/0004` for the appearance round).

### Diner-specific assets

The Diner Revival theme (`diner`) owns three things no other theme uses:

- **Ramps** — `--color-cherry-*`, `--color-butter-*`, `--color-cola-*` in
  `globals.css` (Tailwind has no brown scale). Authored in OKLCH, every
  accent pair contrast-verified at AA before landing
  (`local/check-diner-contrast.ts`, git-ignored scratch).
- **Display face** — Caprasimo, registered once in the root layout as
  `--font-caprasimo`; the diner wrapper swaps `--display-font` to it
  (the `:root` token behind the `font-display` utility — swap the token,
  not the utility class). Themes pick display faces by overriding
  `--display-font`, never by loading fonts themselves.
- **Awning crown** — `cherry-700`/`butter-400` stripes at the top of the
  page, accent-independent diner identity.

An **accent is a whole palette**, not a text colour: it tints the page
surface, paints the hero band, colours the CTA, and draws the accent rules.

### Static class strings

Accent and layout values are looked up in explicit maps of literal class
strings. Never interpolate an option value into a class name
(`` `bg-${accent}-600` ``) — Tailwind scans source text, so a computed class
is never generated.

### Adding a theme

1. Add the id to `THEME_IDS` in `db/constants.ts`.
2. Widen the `tenants_theme_allowed` CHECK in `db/schema.ts`, then
   `npm run db:generate` and `npm run db:migrate`. This is the one theme
   change that needs a migration.
3. Add accents to `ACCENTS` in `sections.tsx` and a schema in `config.ts`.
4. Write the component and register it in `registry.ts`.
5. Extend the `describe.each` in `themes.test.tsx` — that suite asserts the
   shared content model, images, empty states, accent application, and menu
   layout for every theme.

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
