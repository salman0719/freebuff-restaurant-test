import { describe, expect, it } from "vitest";
import { THEME_IDS } from "../../db/constants";
import { accentsFor, brandDirectionsFor, resolveThemeConfig, themeToggle } from "./config";

describe("resolveThemeConfig", () => {
  it("fills defaults for missing keys", () => {
    expect(resolveThemeConfig("cafe", {})).toEqual({
      accent: "espresso",
      menuLayout: "editorial",
      showHours: true,
    });
    expect(resolveThemeConfig("takeaway", {})).toEqual({
      accent: "chili",
      brandDirection: "smokehouse",
      menuLayout: "compact",
      showDescription: true,
    });
    expect(resolveThemeConfig("diner", {})).toEqual({
      accent: "cherry",
      menuLayout: "compact",
      showHours: true,
    });
    expect(resolveThemeConfig("garden", {})).toEqual({
      accent: "fern",
      menuLayout: "editorial",
      showHours: true,
    });
  });

  it("keeps valid stored options and fills the rest from defaults", () => {
    expect(resolveThemeConfig("cafe", { accent: "tomato", showHours: false })).toEqual({
      accent: "tomato",
      menuLayout: "editorial",
      showHours: false,
    });
    expect(resolveThemeConfig("takeaway", { menuLayout: "grid" })).toEqual({
      accent: "chili",
      brandDirection: "smokehouse",
      menuLayout: "grid",
      showDescription: true,
    });
  });

  it("falls back to full defaults for invalid values and strips unknown keys", () => {
    // Zod validates the object atomically: one bad option resets the whole
    // config rather than merging half-valid state.
    expect(resolveThemeConfig("cafe", { accent: "neon", showHours: false, hacked: true })).toEqual({
      accent: "espresso",
      menuLayout: "editorial",
      showHours: true,
    });
    expect(resolveThemeConfig("cafe", { accent: "tomato", hacked: true })).toEqual({
      accent: "tomato",
      menuLayout: "editorial",
      showHours: true,
    });
    expect(resolveThemeConfig("cafe", { menuLayout: "carousel" })).toEqual({
      accent: "espresso",
      menuLayout: "editorial",
      showHours: true,
    });
  });

  it("returns full defaults for unparseable input", () => {
    for (const input of [null, undefined, "espresso", 42, []] as const) {
      expect(resolveThemeConfig("cafe", input)).toEqual({
        accent: "espresso",
        menuLayout: "editorial",
        showHours: true,
      });
    }
  });
});

describe("accentsFor", () => {
  it("returns each theme's own accent vocabulary", () => {
    expect(accentsFor("cafe")).toEqual(["espresso", "terracotta", "tomato"]);
    expect(accentsFor("takeaway")).toEqual(["chili", "charcoal", "gold"]);
    expect(accentsFor("bistro")).toEqual(["plum", "navy", "sage"]);
    expect(accentsFor("diner")).toEqual(["cherry", "butter", "cola"]);
    expect(accentsFor("garden")).toEqual(["fern", "brook", "celery"]);
  });

  it("gives every shipped theme a palette list", () => {
    for (const id of THEME_IDS) expect(accentsFor(id).length).toBeGreaterThan(0);
  });
});

describe("brandDirectionsFor", () => {
  it("offers curated fast-casual directions only where supported", () => {
    expect(brandDirectionsFor("takeaway").map(({ value }) => value)).toEqual([
      "smokehouse",
      "drive-in",
      "modern",
    ]);
    expect(brandDirectionsFor("cafe")).toEqual([]);
  });

  it("falls back safely for stale or invalid stored directions", () => {
    expect(resolveThemeConfig("takeaway", { brandDirection: "custom-js" })).toEqual({
      accent: "chili",
      brandDirection: "smokehouse",
      menuLayout: "compact",
      showDescription: true,
    });
  });
});

describe("themeToggle", () => {
  // Regression guard: the dashboard used to infer the toggle key from
  // "is this café?", so bistro and diner posted `showDescription` to a schema
  // that only has `showHours` — a checkbox that saved nothing.
  it("names a toggle that exists on that theme's own config", () => {
    for (const id of THEME_IDS) {
      const toggle = themeToggle(id);
      expect(Object.keys(resolveThemeConfig(id, {}))).toContain(toggle.name);
      expect(toggle.label.length).toBeGreaterThan(0);
    }
  });
});
