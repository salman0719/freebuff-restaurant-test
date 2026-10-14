/**
 * Accent contrast guard — no accent may ship failing WCAG AA.
 *
 * `ACCENTS` in `./sections.tsx` is the only way a theme gets colour, so
 * this suite resolves every palette's foreground/background pairs back to
 * concrete sRGB values and checks them:
 *
 * - text pairs (eyebrow, heading, band copy, button label) at 4.5:1, on
 *   both the light and the dark surface;
 * - the decorative accent rule at 3:1 (WCAG 1.4.11 non-text guidance).
 *
 * Colour values are read from the same files the browser reads — Tailwind's
 * shipped default palette (`tailwindcss/theme.css`) and this project's own
 * ramps and page background (`src/app/globals.css`) — so editing a ramp or
 * swapping an accent class to a weaker colour fails here instead of on a
 * tenant's live site.
 *
 * Coverage is automatic: adding an accent to `ACCENTS` adds it to the
 * `describe.each` below, and a theme whose accent list names a palette that
 * does not exist fails too. This is the durable replacement for the
 * git-ignored scratch verifier of `docs/decisions/0004`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_IDS } from "../../db/constants";
import { accentsFor } from "./config";
import { ACCENTS, type AccentPalette } from "./sections";

type Rgb = readonly [number, number, number];

// --- colour token sources -------------------------------------------------

/** `--color-<name>-<step>: <value>;` declarations that resolve to a colour. */
function readColorTokens(css: string, into: Map<string, string>): Map<string, string> {
  for (const [, name, step, value] of css.matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)) {
    const trimmed = value.trim();
    if (/^(#|oklch\(|rgb|hsl)/.test(trimmed)) {
      into.set(`${name}-${step}`, trimmed);
    }
  }
  return into;
}

const root = process.cwd();
const globalsCss = readFileSync(join(root, "src/app/globals.css"), "utf8");
const tokens = readColorTokens(
  readFileSync(join(root, "node_modules/tailwindcss/theme.css"), "utf8"),
  new Map<string, string>()
);
// Project ramps (cherry/butter/cola) extend the default palette.
readColorTokens(globalsCss, tokens);
tokens.set("white", "#ffffff");

/** Page background the tinted light surface is composited over. */
const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(globalsCss)?.[1];
const pageBackground = /--background:\s*([^;]+);/.exec(rootBlock ?? "")?.[1];
if (!pageBackground) throw new Error("No --background token in the :root block of globals.css");
const PAGE_LIGHT = parseColor(pageBackground);

// --- colour math ----------------------------------------------------------

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** OKLCH -> sRGB, clipping out-of-gamut channels (gamut loss is <1 LSB). */
function oklchToRgb(l: number, c: number, h: number): Rgb {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lr = l_ ** 3;
  const mr = m_ ** 3;
  const sr = s_ ** 3;

  const r = 4.0767416621 * lr - 3.3077115913 * mr + 0.2309699292 * sr;
  const g = -1.2684380046 * lr + 2.6097574011 * mr - 0.3413193965 * sr;
  const bb = -0.0041960863 * lr - 0.7034186147 * mr + 1.707614701 * sr;

  const enc = (v: number) => Math.round(clamp01(linearToSrgb(clamp01(v))) * 255);
  return [enc(r), enc(g), enc(bb)];
}

/** Parse a CSS colour (hex or `oklch()`) into 8-bit sRGB. */
function parseColor(color: string): Rgb {
  const value = color.trim().toLowerCase();
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const n = parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = value.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)(%?)\s+(none|[\d.]+)/);
  if (!m) throw new Error(`Unsupported colour value: ${color}`);
  const l = m[2] === "%" ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  const c = m[4] === "%" ? parseFloat(m[3]) / 100 : parseFloat(m[3]);
  const h = m[5] === "none" ? 0 : parseFloat(m[5]);
  return oklchToRgb(l, c, h);
}

/** WCAG relative luminance. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => srgbToLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Alpha-composite `over` onto opaque `under`. */
function blend(over: Rgb, alpha: number, under: Rgb): Rgb {
  return [
    over[0] * alpha + under[0] * (1 - alpha),
    over[1] * alpha + under[1] * (1 - alpha),
    over[2] * alpha + under[2] * (1 - alpha),
  ];
}

// --- palette class parsing ------------------------------------------------

/** The literal colour utility for a role, e.g. `bg-cherry-50/70` or `text-cherry-800`. */
function utilityFor(classes: string, prefix: "bg" | "text", dark: boolean): string {
  const found = classes.split(/\s+/).find((token) => {
    const isDark = token.startsWith("dark:");
    const base = isDark ? token.slice("dark:".length) : token;
    return base.startsWith(`${prefix}-`) && isDark === dark;
  });
  if (!found) {
    throw new Error(`No ${dark ? "dark" : "light"} ${prefix} utility in "${classes}"`);
  }
  return found.replace(/^dark:/, "");
}

/**
 * Resolve a colour utility (with optional `/alpha`) to opaque sRGB.
 * `bg-page` is the untinted page background a tinted surface sits on.
 */
function resolveUtility(utility: string): Rgb {
  if (utility === "bg-page") return PAGE_LIGHT;
  const m = utility.match(/^(?:bg|text)-(.+?)(?:\/(\d+))?$/);
  if (!m) throw new Error(`Unsupported utility: ${utility}`);
  const value = tokens.get(m[1]);
  if (!value) throw new Error(`Unknown colour token: ${utility}`);
  const rgb = parseColor(value);
  const alpha = m[2] ? Number(m[2]) / 100 : 1;
  return alpha === 1 ? rgb : blend(rgb, alpha, PAGE_LIGHT);
}

interface ContrastPair {
  label: string;
  fg: Rgb;
  bg: Rgb;
  min: number;
}

const TEXT_MIN = 4.5;
const RULE_MIN = 3;

/** Every foreground/background pair a palette produces, in render order. */
function pairsFor(palette: AccentPalette): ContrastPair[] {
  const text = (label: string, fg: string, bg: string): ContrastPair => ({
    label,
    fg: resolveUtility(fg),
    bg: resolveUtility(bg),
    min: TEXT_MIN,
  });

  const surfaceLight = utilityFor(palette.surface, "bg", false);
  const surfaceDark = utilityFor(palette.surface, "bg", true);
  const eyebrowLight = utilityFor(palette.eyebrow, "text", false);
  const eyebrowDark = utilityFor(palette.eyebrow, "text", true);
  const headingLight = utilityFor(palette.heading, "text", false);
  const headingDark = utilityFor(palette.heading, "text", true);
  const band = utilityFor(palette.band, "bg", false);
  const button = utilityFor(palette.button, "bg", false);
  const hover = palette.button
    .split(/\s+/)
    .find((token) => token.startsWith("hover:bg-"))
    ?.replace("hover:", "");

  return [
    text("eyebrow on the tinted surface", eyebrowLight, surfaceLight),
    text("eyebrow on the page background", eyebrowLight, "bg-page"),
    text("heading on the tinted surface", headingLight, surfaceLight),
    text("heading on the page background", headingLight, "bg-page"),
    {
      label: "accent rule on the tinted surface",
      fg: resolveUtility(utilityFor(palette.rule, "bg", false)),
      bg: resolveUtility(surfaceLight),
      min: RULE_MIN,
    },
    text("band heading", utilityFor(palette.bandText, "text", false), band),
    text("band eyebrow", utilityFor(palette.bandEyebrow, "text", false), band),
    text("band body", utilityFor(palette.bandBody, "text", false), band),
    text("button label", "text-white", button),
    ...(hover ? [text("button label on hover", "text-white", hover)] : []),
    text("eyebrow on the dark surface", eyebrowDark, surfaceDark),
    text("heading on the dark surface", headingDark, surfaceDark),
  ];
}

describe.each(Object.entries(ACCENTS))("accent %s", (name, palette) => {
  it("clears WCAG AA on every text pair and 3:1 for its rule", () => {
    const pairs = pairsFor(palette);
    expect(pairs.length).toBeGreaterThan(0);
    // Report every violation at once — one run should tell the whole story.
    const violations = pairs
      .map((pair) => ({ ...pair, ratio: contrastRatio(pair.fg, pair.bg) }))
      .filter((pair) => pair.ratio < pair.min)
      .map((pair) => `${pair.label}: ${pair.ratio.toFixed(2)}:1 (needs ${pair.min}:1)`);
    expect(violations, `accent "${name}" fails WCAG AA`).toEqual([]);
  });
});

describe("accent coverage", () => {
  it("defines a palette for every accent its themes can select", () => {
    for (const id of THEME_IDS) {
      for (const accent of accentsFor(id)) {
        expect(ACCENTS[accent], `${id} selects "${accent}"`).toBeDefined();
      }
    }
  });
});
