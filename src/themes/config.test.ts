import { describe, expect, it } from "vitest";
import { accentsFor, resolveThemeConfig } from "./config";

describe("resolveThemeConfig", () => {
  it("fills defaults for missing keys", () => {
    expect(resolveThemeConfig("cafe", {})).toEqual({
      accent: "espresso",
      menuLayout: "editorial",
      showHours: true,
    });
    expect(resolveThemeConfig("takeaway", {})).toEqual({
      accent: "chili",
      menuLayout: "compact",
      showDescription: true,
    });
    expect(resolveThemeConfig("diner", {})).toEqual({
      accent: "cherry",
      menuLayout: "compact",
      showHours: true,
    });
  });

  it("keeps valid stored options and fills the rest from defaults", () => {
    expect(resolveThemeConfig("cafe", { accent: "forest", showHours: false })).toEqual({
      accent: "forest",
      menuLayout: "editorial",
      showHours: false,
    });
    expect(resolveThemeConfig("takeaway", { menuLayout: "grid" })).toEqual({
      accent: "chili",
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
    expect(resolveThemeConfig("cafe", { accent: "forest", hacked: true })).toEqual({
      accent: "forest",
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
    expect(accentsFor("cafe")).toEqual(["espresso", "forest", "terracotta"]);
    expect(accentsFor("takeaway")).toEqual(["chili", "charcoal", "gold"]);
    expect(accentsFor("diner")).toEqual(["cherry", "butter", "cola"]);
  });
});
