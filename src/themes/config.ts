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

const cafeConfigSchema = z.object({
  accent: z.enum(CAFE_ACCENTS).default("espresso"),
  showHours: z.boolean().default(true),
});

const takeawayConfigSchema = z.object({
  accent: z.enum(TAKEAWAY_ACCENTS).default("chili"),
  showDescription: z.boolean().default(true),
});

const CONFIG_SCHEMAS = {
  cafe: cafeConfigSchema,
  takeaway: takeawayConfigSchema,
} satisfies Record<ThemeId, z.ZodTypeAny>;

export type CafeConfig = z.infer<typeof cafeConfigSchema>;
export type TakeawayConfig = z.infer<typeof takeawayConfigSchema>;
export type ThemeConfig = CafeConfig | TakeawayConfig;

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
