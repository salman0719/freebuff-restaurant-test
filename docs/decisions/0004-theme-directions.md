# 0004 — Theme directions (approved by owner 2026-10-14)

## Context

Phase 3 (owner dashboard) shipped; the roadmap detour is visual work.
Three themes exist (`cafe`, `takeaway`, `bistro`) but they share the same
warm cast, display face, and section rhythm. Research (2026-10-14) scanned
current restaurant-web directions, multi-tenant theming architecture, and
inspiration resources; findings and sources live in the research thread,
the durable conclusions are recorded here.

## Decision

Build **two new themes, shipped in one migration** (a single widening of
`tenants_theme_allowed` covering both ids):

1. **`diner` — Diner Revival, first.** Retro comfort food: cream/cherry/
   cola palette, retro display type, menu-board arrangement. Unlocks
   diners, burger joints, bakeries, dessert shops.
2. **`garden` — Market Garden, second.** Farm-to-table/plant-forward: cool
   botanical palette (the platform's first non-warm family), asymmetric
   sections, seasonal feature module.

**Deferred:** Counter Culture (brutalist/grotesk) — smallest audience and
highest risk to the credibility/menu-legibility fundamentals; revisit
after the add-a-theme pipeline has run twice.

**Split out (no migration needed):** refreshes of `cafe` (Modern
Trattoria) and `takeaway` (Night Market) — palette/rhythm changes only.

Criteria used: segment gap × visual distance from the shipped three ÷
implementation cost. Themes vary type, colour, density, and section
arrangement — never the information architecture (menu, hours, location,
one primary CTA stay reachable in every theme).

## Font presets

- Fonts are registered once in the root layout via `next/font/google`
  and exposed as CSS variables; a theme selects its display face by
  overriding the `--display-font` root token (which the `font-display`
  utility references) on its wrapper. No tenant-supplied font URLs ever.
- Diner display face: **Caprasimo** (Google Fonts, libre/OFL) — a
  Cooper-style retro serif _based on Fraunces_, so it harmonises with the
  platform's existing display face while reading 50s/70s diner. Single
  weight, latin subset, `display: swap`.
- Body/UI stays Geist everywhere, including the dashboard.

## Accent palettes

- Tailwind has no brown scale and its yellows are too lemon for butter,
  so diner gets three dedicated OKLCH-authored ramps in
  `src/app/globals.css` (`--color-cherry-*`, `--color-butter-*`,
  `--color-cola-*`), following the existing `--brand-*` pattern.
- The `butter` accent is deliberately a **light band under dark text**
  (the first of its kind in `ACCENTS`) — the signature diner move; the
  other two keep the dark-band pattern.
- Every accent pair (eyebrow/heading/band text ×3/button/rules, light and
  dark) is verified ≥ 4.5:1 (decorative rules ≥ 3:1) before landing;
  scratch verifier: `local/check-diner-contrast.ts` (git-ignored). The
  three shipped accents also pass as reference pairs.

**Update 2026-10-14:** the scratch verifier graduated to a committed unit
test, `src/themes/contrast.test.ts`, so no accent (existing nine, diner's
three, and every future one) can ship failing AA — CI now runs it. Widening
it past the diner palettes caught a real shipped failure: the `gold`
accent's band and button (yellow-600 under light text, 2.7–2.9:1) and its
rule (1.8:1). Those steps moved darker; no other accent changed.

## Rules

- One migration for both theme ids; build `diner` first, `garden` second
  with no further migration.
- Follow the pipeline in `docs/design-system.md` (ACCENTS → config schema
  → component → registry → `describe.each`).
- Ship = `npm run check`, `npm run test:run`, `npm run build`, plus a
  visual pass against seeded tenants.
