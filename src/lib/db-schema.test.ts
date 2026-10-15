/**
 * Schema-adjacent tests for the MVP database model (Phase 1.1).
 * No live database needed: table definitions are pure metadata and the
 * migration-SQL check reads committed files from `db/migrations`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  DOMAIN_STATUSES,
  MEMBERSHIP_ROLES,
  SLUG_PATTERN,
  THEME_IDS,
  accounts,
  auditEvents,
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
    expect([...THEME_IDS]).toEqual(["cafe", "takeaway", "bistro", "diner", "garden"]);
  });

  it("supports owner and operator membership roles", () => {
    expect([...MEMBERSHIP_ROLES]).toEqual(["owner", "operator"]);
  });
});

describe("the audit trail table (Phase 4.4)", () => {
  const config = getTableConfig(auditEvents);

  it("is an append-only table: a record of what happened is not edited", () => {
    expect(config.name).toBe("audit_events");
    const names = config.columns.map((column) => column.name);
    expect(names).toContain("created_at");
    // Every other table in the schema carries both timestamps. The missing
    // column here is the enforcement, not an oversight.
    expect(names).not.toContain("updated_at");
  });

  it("outlives the rows it describes", () => {
    // A deleted restaurant must not erase the fact that someone created it —
    // unlike every tenant-owned table, which cascades on purpose.
    expect(config.foreignKeys).toHaveLength(1);
    const tenantFk = config.foreignKeys[0];
    expect(tenantFk.onDelete).toBe("set null");
    // The actor carries no foreign key at all, so closing an account cannot
    // delete its history either.
    const actorFk = config.foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === "actor_user_id")
    );
    expect(actorFk).toBeUndefined();
  });

  it("constrains the action to a closed vocabulary", () => {
    // The vocabulary's CONTENT is asserted against the committed SQL below,
    // where it is a plain string; here the point is that a CHECK exists at
    // all, so an action cannot be anything a caller invents.
    const check = config.checks.find((entry) => entry.name === "audit_events_action_allowed");
    expect(check).toBeDefined();
    expect(AUDIT_ACTIONS.length).toBeGreaterThan(0);
  });

  it("indexes the reads the console actually makes", () => {
    const indexes = config.indexes.map((index) => index.config.name);
    // One restaurant's history, and the platform-wide feed across all of them.
    expect(indexes).toContain("audit_events_tenant_created_idx");
    expect(indexes).toContain("audit_events_created_idx");
  });
});

describe("custom-domain verification state (Phase 5.2)", () => {
  const config = getTableConfig(tenants);

  it("constrains the claim state to a closed vocabulary", () => {
    // Same rule as the audit actions: a new state is a deliberate
    // migration, not something a caller can write.
    const check = config.checks.find(
      (entry) => entry.name === "tenants_custom_domain_status_allowed"
    );
    expect(check).toBeDefined();
    expect([...DOMAIN_STATUSES]).toEqual(["none", "pending", "verified"]);
  });

  it("keeps a claim, its state, and its TXT token together", () => {
    // 'none' ⇔ no domain, and a live claim always carries the token that
    // can verify it — the two invariants the claim flow maintains.
    expect(config.checks.find((e) => e.name === "tenants_custom_domain_claim_present")).toBeDefined();
    expect(config.checks.find((e) => e.name === "tenants_custom_domain_token_present")).toBeDefined();
  });

  it("keeps the domain claim unique across tenants", () => {
    // Read from the committed SQL rather than the table config: the
    // constraint has shipped since 0000, and the deployed text is what
    // actually rejects a second tenant claiming the same domain.
    const dir = join(process.cwd(), "db", "migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8").toLowerCase())
      .join("\n");
    expect(sql).toContain("tenants_custom_domain_unique");
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
    "audit_events",
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

  it("deploys the custom-domain status vocabulary (5.2)", () => {
    expect(sql).toContain("tenants_custom_domain_status_allowed");
    expect(sql).toContain("('none', 'pending', 'verified')");
    expect(sql).toContain("tenants_custom_domain_claim_present");
    expect(sql).toContain("tenants_custom_domain_token_present");
  });

  it("uses the shared SLUG_PATTERN in the slug CHECK", () => {
    expect(sql).toContain(SLUG_PATTERN);
  });

  it("widens the theme CHECK once to cover both new theme ids (0004)", () => {
    expect(sql).toContain("in ('cafe', 'takeaway', 'bistro', 'diner', 'garden')");
  });

  // The audit migration alone, so an assertion about the trail cannot be
  // satisfied by some other table's row.
  const auditMigration = sqlFiles.find((file) =>
    readFileSync(join(dir, file), "utf8").toLowerCase().includes('create table "audit_events"')
  );
  const auditSql = auditMigration
    ? readFileSync(join(dir, auditMigration), "utf8").toLowerCase()
    : "";

  it("ships the audit trail in its own migration", () => {
    expect(auditMigration).toBeDefined();
    expect(auditSql).toContain("audit_events_tenant_id_tenants_id_fk");
  });

  it("makes the deployed audit trail survive a deleted restaurant", () => {
    expect(auditSql).toContain("on delete set null");
    // Nothing in this migration cascades: the migration is the last word on
    // what the live database does with these rows.
    expect(auditSql).not.toContain("cascade");
  });

  it("deploys the trail as append-only", () => {
    expect(auditSql).toContain("created_at");
    expect(auditSql).not.toContain("updated_at");
  });

  it("deploys the action vocabulary the app ships", () => {
    // The vocabulary grows by widening the CHECK in later migrations (a new
    // recorded act is a deliberate migration), so this spans every migration
    // that names the CHECK — the deployed constraint is the last one.
    const vocabularySql = sqlFiles
      .filter((file) =>
        readFileSync(join(dir, file), "utf8").toLowerCase().includes("audit_events_action_allowed")
      )
      .map((file) => readFileSync(join(dir, file), "utf8").toLowerCase())
      .join("\n");
    for (const action of AUDIT_ACTIONS) {
      expect(vocabularySql).toContain(action);
    }
    expect(vocabularySql).toContain("audit_events_action_allowed");
  });

  it("deploys the index the platform-wide feed reads through", () => {
    // Across every migration: the index ships in its own, after the table.
    expect(sql).toContain("audit_events_created_idx");
  });
});
