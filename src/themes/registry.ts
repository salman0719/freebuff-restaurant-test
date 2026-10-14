/**
 * Typed theme registry (Phase 2.2).
 *
 * The ONLY place themes are chosen. Callers pass a validated `ThemeId`
 * (usually `restaurant.theme` from the public view) and receive the
 * component; anything else — unknown strings, nulls, stale database values
 * from before a theme was retired — resolves to the café fallback, never a
 * crash and never an unregistered component. `resolveThemeId` re-validates
 * with the shared Zod schema so validation stays single-sourced.
 */
import { THEME_IDS, type ThemeId } from "../../db/constants";
import { themeSchema } from "../lib/validation";
import { BistroTheme } from "./bistro";
import { CafeTheme } from "./cafe";
import { DinerTheme } from "./diner";
import { GardenTheme } from "./garden";
import { TakeawayTheme } from "./takeaway";
import type { ThemeComponent, ThemeDefinition } from "./types";

export const DEFAULT_THEME: ThemeId = "cafe";

const REGISTRY: Record<ThemeId, ThemeDefinition> = {
  cafe: {
    id: "cafe",
    label: "Café",
    blurb: "Warm and editorial — story first, then menu, then visit details.",
    Component: CafeTheme,
  },
  takeaway: {
    id: "takeaway",
    label: "Takeaway",
    blurb: "Bold and direct — an accent hero band, menu leads, details follow in one pass.",
    Component: TakeawayTheme,
  },
  bistro: {
    id: "bistro",
    label: "Bistro",
    blurb: "Refined and modern — a split hero and a card-style two-column menu.",
    Component: BistroTheme,
  },
  diner: {
    id: "diner",
    label: "Diner",
    blurb: "Retro and playful — awning stripes, a framed menu board, and a call-to-order strip.",
    Component: DinerTheme,
  },
  garden: {
    id: "garden",
    label: "Garden",
    blurb: "Cool and seasonal — a green-and-teal palette, an asymmetric split, and a market list.",
    Component: GardenTheme,
  },
};

/** Registry ids always match the validated theme vocabulary. */
export function listThemeIds(): ThemeId[] {
  return [...THEME_IDS];
}

/** Theme picker entries for the dashboard (Phase 3.7). */
export function listThemes(): ThemeDefinition[] {
  return listThemeIds().map((id) => REGISTRY[id]);
}

/** Validate unknown input against the shared schema, falling back to café. */
export function resolveThemeId(input: unknown): ThemeId {
  const parsed = themeSchema.safeParse(input);
  return parsed.success ? parsed.data : DEFAULT_THEME;
}

/** Component for a validated id; unknown ids fall back to café. */
export function getTheme(id: ThemeId): ThemeComponent {
  return REGISTRY[id]?.Component ?? REGISTRY[DEFAULT_THEME].Component;
}

/** Definition (metadata + component) for a validated id, with fallback. */
export function getThemeDefinition(id: ThemeId): ThemeDefinition {
  return REGISTRY[id] ?? REGISTRY[DEFAULT_THEME];
}
