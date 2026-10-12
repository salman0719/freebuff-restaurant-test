import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_IDS } from "../../db/constants";
import {
  DEFAULT_THEME,
  getTheme,
  getThemeDefinition,
  listThemeIds,
  listThemes,
  resolveThemeId,
} from "./registry";

describe("registry", () => {
  it("lists exactly the validated theme vocabulary", () => {
    expect(listThemeIds()).toEqual([...THEME_IDS]);
    expect(listThemes().map((theme) => theme.id)).toEqual([...THEME_IDS]);
  });

  it("resolves every registered id to its component", () => {
    for (const id of THEME_IDS) {
      expect(getTheme(id)).toBe(getThemeDefinition(id).Component);
    }
  });

  it("falls back to café for unknown ids", () => {
    expect(getTheme("retired" as never)).toBe(getTheme(DEFAULT_THEME));
    expect(getThemeDefinition("retired" as never).id).toBe("cafe");
  });

  it("validates input through the shared schema with fallback", () => {
    expect(resolveThemeId("takeaway")).toBe("takeaway");
    expect(resolveThemeId("neon")).toBe("cafe");
    expect(resolveThemeId(null)).toBe("cafe");
    expect(resolveThemeId(undefined)).toBe("cafe");
  });
});

describe("theme isolation", () => {
  // Convention guard: themes receive data only through props. If a theme
  // ever imports the database client, the session, or permission helpers,
  // this fails and the import must move to a Server Component or handler.
  // (`db/constants` is deliberately allowed: dependency-free shared
  // vocabulary, safe for any bundle — see its module docstring.)
  const banned = ["db/index", "db/schema", "@/auth", "next-auth", "permissions", "tenant-"];

  it("keeps database queries and authorisation outside theme components", () => {
    const dir = join(process.cwd(), "src", "themes");
    const files = readdirSync(dir).filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const source = readFileSync(join(dir, file), "utf8");
      for (const pattern of banned) {
        expect(source, `${file} must not reference ${pattern}`).not.toContain(pattern);
      }
    }
  });
});
