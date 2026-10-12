import { describe, expect, it } from "vitest";
import { resolveThemeConfig } from "./config";

describe("resolveThemeConfig", () => {
  it("fills defaults for missing keys", () => {
    expect(resolveThemeConfig("cafe", {})).toEqual({ accent: "espresso", showHours: true });
    expect(resolveThemeConfig("takeaway", {})).toEqual({ accent: "chili", showDescription: true });
  });

  it("keeps valid stored options", () => {
    expect(resolveThemeConfig("cafe", { accent: "forest", showHours: false })).toEqual({
      accent: "forest",
      showHours: false,
    });
  });

  it("falls back to full defaults for invalid values and strips unknown keys", () => {
    // Zod validates the object atomically: one bad option resets the whole
    // config rather than merging half-valid state.
    expect(resolveThemeConfig("cafe", { accent: "neon", showHours: false, hacked: true })).toEqual({
      accent: "espresso",
      showHours: true,
    });
    expect(resolveThemeConfig("cafe", { accent: "forest", hacked: true })).toEqual({
      accent: "forest",
      showHours: true,
    });
  });

  it("returns full defaults for unparseable input", () => {
    for (const input of [null, undefined, "espresso", 42, []] as const) {
      expect(resolveThemeConfig("cafe", input)).toEqual({ accent: "espresso", showHours: true });
    }
  });
});
