/**
 * Schema-adjacent tests for the MVP database model (Phase 1.1).
 * No live database needed: table definitions are pure metadata and the
 * migration-SQL check reads committed files from `db/migrations`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  MEMBERSHIP_ROLES,
  SLUG_PATTERN,
  THEME_IDS,
  accounts,
  memberships,
  menuCategories,
  menuItems,
  openingHours,
  restaurantProfiles,
  sessions,
  tenants,
  users,
  verificationTokens,
} from "../../db/schema";

describe("MVP tables", () => {
  it("defines every table the product scope requires", () => {
    expect(getTableName(tenants)).toBe("tenants");
    expect(getTableName(memberships)).toBe("memberships");
    expect(getTableName(restaurantProfiles)).toBe("restaurant_profiles");
    expect(getTableName(openingHours)).toBe("opening_hours");
    expect(getTableName(menuCategories)).toBe("menu_categories");
    expect(getTableName(menuItems)).toBe("menu_items");
  });

  it("defines the Auth.js adapter tables owned by Phase 1.3", () => {
    expect(getTableName(users)).toBe("users");
    expect(getTableName(accounts)).toBe("accounts");
    expect(getTableName(sessions)).toBe("sessions");
    expect(getTableName(verificationTokens)).toBe("verification_tokens");
  });

  it("locks the shipped theme set", () => {
    expect([...THEME_IDS]).toEqual(["cafe", "takeaway", "bistro", "diner"]);
  });

  it("supports owner and operator membership roles", () => {
    expect([...MEMBERSHIP_ROLES]).toEqual(["owner", "operator"]);
  });
});

describe("committed migrations", () => {
  const dir = join(process.cwd(), "db", "migrations");
  const sqlFiles = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const sql = sqlFiles.map((f) => readFileSync(join(dir, f), "utf8").toLowerCase()).join("\n");

  it("commits at least one migration", () => {
    expect(sqlFiles.length).toBeGreaterThan(0);
  });

  it.each([
    "tenants",
    "memberships",
    "restaurant_profiles",
    "opening_hours",
    "menu_categories",
    "menu_items",
    "users",
    "accounts",
    "sessions",
    "verification_tokens",
  ])("creates table %s", (table) => {
    expect(sql).toContain(`create table`);
    expect(sql).toContain(`"${table}"`);
  });

  it("carries tenant scoping, money-as-cents, and uuid defaults", () => {
    expect(sql).toContain("tenant_id");
    expect(sql).toContain("price_cents");
    expect(sql).toContain("gen_random_uuid()");
  });

  it("enforces slug format, weekday range, and non-negative prices", () => {
    expect(sql).toContain("tenants_slug_format");
    expect(sql).toContain("opening_hours_weekday_range");
    expect(sql).toContain("menu_items_price_non_negative");
  });

  it("uses the shared SLUG_PATTERN in the slug CHECK", () => {
    expect(sql).toContain(SLUG_PATTERN);
  });

  it("widens the theme CHECK once to cover both new theme ids (0004)", () => {
    expect(sql).toContain("in ('cafe', 'takeaway', 'bistro', 'diner', 'garden')");
  });
});
