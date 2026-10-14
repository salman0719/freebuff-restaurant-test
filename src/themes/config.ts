/**
 * Per-theme configuration (Phase 2.3, extensibility move 1).
 *
 * Code-only themes force every visual choice through a developer; options
 * let tenants customise appearance without a new theme. Each theme declares
 * a Zod schema with defaults — new options never need a migration, only a
 * schema default. Resolution is defensive: unknown, partial, or stale
 * stored JSON always yields a complete valid config, never a throw.
 *
 * Accent values map to explicit Tailwind class strings (see `ACCENTS` in
 * `./sections.tsx`): classes must stay statically enumerable so Tailwind
 * can generate them — never interpolate option values into class names.
 */
import { z } from "zod";
import type { ThemeId } from "../../db/constants";

export const CAFE_ACCENTS = ["espresso", "forest", "terracotta"] as const;
export const TAKEAWAY_ACCENTS = ["chili", "charcoal", "gold"] as const;
export const BISTRO_ACCENTS = ["plum", "navy", "sage"] as const;
export const DINER_ACCENTS = ["cherry", "butter", "cola"] as const;
export const MENU_LAYOUTS = ["editorial", "compact", "grid"] as const;

export type MenuLayout = (typeof MENU_LAYOUTS)[number];

const cafeConfigSchema = z.object({
  accent: z.enum(CAFE_ACCENTS).default("espresso"),
  menuLayout: z.enum(MENU_LAYOUTS).default("editorial"),
  showHours: z.boolean().default(true),
});

const takeawayConfigSchema = z.object({
  accent: z.enum(TAKEAWAY_ACCENTS).default("chili"),
  menuLayout: z.enum(MENU_LAYOUTS).default("compact"),
  showDescription: z.boolean().default(true),
});

const bistroConfigSchema = z.object({
  accent: z.enum(BISTRO_ACCENTS).default("plum"),
  menuLayout: z.enum(MENU_LAYOUTS).default("grid"),
  showHours: z.boolean().default(true),
});

const dinerConfigSchema = z.object({
  accent: z.enum(DINER_ACCENTS).default("cherry"),
  menuLayout: z.enum(MENU_LAYOUTS).default("compact"),
  showHours: z.boolean().default(true),
});

const CONFIG_SCHEMAS = {
  cafe: cafeConfigSchema,
  takeaway: takeawayConfigSchema,
  bistro: bistroConfigSchema,
  diner: dinerConfigSchema,
} satisfies Record<ThemeId, z.ZodTypeAny>;

export type CafeConfig = z.infer<typeof cafeConfigSchema>;
export type TakeawayConfig = z.infer<typeof takeawayConfigSchema>;
export type BistroConfig = z.infer<typeof bistroConfigSchema>;
export type DinerConfig = z.infer<typeof dinerConfigSchema>;
export type ThemeConfig = CafeConfig | TakeawayConfig | BistroConfig | DinerConfig;

/**
 * The strict schema for a theme — no silent fallback, for write paths that
 * must reject a bad option rather than quietly reset it. Read paths keep
 * using `resolveThemeConfig`, which is deliberately forgiving.
 */
export function themeConfigSchema(themeId: ThemeId): z.ZodTypeAny {
  return CONFIG_SCHEMAS[themeId] ?? CONFIG_SCHEMAS.cafe;
}

const THEME_ACCENTS: Record<ThemeId, readonly string[]> = {
  cafe: CAFE_ACCENTS,
  takeaway: TAKEAWAY_ACCENTS,
  bistro: BISTRO_ACCENTS,
  diner: DINER_ACCENTS,
};

/** The accent vocabulary for a theme (used by the dashboard options form). */
export function accentsFor(themeId: ThemeId): readonly string[] {
  return THEME_ACCENTS[themeId] ?? CAFE_ACCENTS;
}

/**
 * The one visibility toggle each theme exposes in the dashboard. Themes
 * differ here (`showHours` vs `showDescription`), so the options page AND
 * its server action both read this map: inferring the key from "is this
 * café?" made every other theme submit the wrong field, which the theme's
 * own schema then stripped — the checkbox silently did nothing.
 */
export const THEME_TOGGLES = {
  cafe: { name: "showHours", label: "Show opening hours on the site" },
  takeaway: {
    name: "showDescription",
    label: "Show the description in the hero band",
  },
  bistro: { name: "showHours", label: "Show opening hours on the site" },
  diner: { name: "showHours", label: "Show opening hours on the site" },
} as const satisfies Record<ThemeId, { name: string; label: string }>;

/** The toggle vocabulary for a theme (used by the dashboard options form). */
export function themeToggle(themeId: ThemeId): (typeof THEME_TOGGLES)[ThemeId] {
  return THEME_TOGGLES[themeId] ?? THEME_TOGGLES.cafe;
}

/**
 * Validate stored JSON for `themeId`, filling defaults for missing keys
 * and falling back to full defaults for anything unparseable. Unknown keys
 * are stripped (`.strip()` is Zod's default for objects).
 */
export function resolveThemeConfig(themeId: ThemeId, input: unknown): ThemeConfig {
  const schema = CONFIG_SCHEMAS[themeId] ?? CONFIG_SCHEMAS.cafe;
  const parsed = schema.safeParse(input ?? {});
  if (parsed.success) {
    return parsed.data as ThemeConfig;
  }
  return schema.parse({}) as ThemeConfig;
}
