/**
 * Operator gate tests (Phase 4.1).
 *
 * Two concerns:
 * 1. The decision — who is allowed through `/operator`, and what happens to
 *    everyone else. Pure, so it runs without a database.
 * 2. The convention — every page/layout/action/route under `src/app/operator`
 *    must go through the gate. A new operator surface that forgets it fails
 *    here rather than shipping.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { OPERATOR_SIGN_IN_PATH, operatorGate } from "./operator-access";
import type { AuthSession } from "./permissions";

const owner: AuthSession = { user: { id: "user_owner", role: "owner" } };
const staff: AuthSession = { user: { id: "user_staff", role: "operator" } };
const anonymous = { user: { id: "user_ghost" } } as AuthSession;

describe("operatorGate", () => {
  it("allows platform staff and hands back the identity", () => {
    expect(operatorGate(staff)).toEqual({
      kind: "allow",
      user: { userId: "user_staff", role: "operator" },
    });
  });

  it("sends an anonymous caller to sign in, remembering where they were headed", () => {
    for (const session of [null, {} as AuthSession, { user: null } as AuthSession]) {
      expect(operatorGate(session)).toEqual({ kind: "sign-in" });
    }
    expect(OPERATOR_SIGN_IN_PATH).toBe("/login?next=/operator");
  });

  it("shows a signed-in owner the not-found page, never the console", () => {
    // Same outcome as an unknown route: an owner cannot tell the difference
    // between "no console" and "no permission to see the console".
    expect(operatorGate(owner)).toEqual({ kind: "not-found" });
  });

  it("defaults a session with no role to owner, which is refused", () => {
    expect(operatorGate(anonymous)).toEqual({ kind: "not-found" });
  });

  it.each([
    ["Operator"],
    ["operator "],
    [" operator"],
    ["OPERATOR"],
    ["admin"],
    ["superuser"],
    [""],
    ["operator,owner"],
  ])("refuses the near-miss role %j", (role) => {
    // Privilege is an exact match against the database role, so nothing
    // request-supplied can be smuggled past it by case, padding, or a list.
    expect(operatorGate({ user: { id: "user_x", role } })).toEqual({ kind: "not-found" });
  });
});

/** Every file under `dir`, at any depth. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Files that decide access: pages, layouts, route handlers, actions. */
function collectSurfaces(dir: string): string[] {
  return walk(dir).filter((file) => /(^|[\\/])(page|layout|route|actions)\.(ts|tsx)$/.test(file));
}

/**
 * Modules permitted to touch `users.role`.
 *
 * Phase 4.2's provisioning module creates an invited owner's account, and it
 * creates it with the platform DEFAULT role — the same row a first magic-link
 * sign-in would produce. Nothing here grants an elevated role, and it is the
 * only entry. The guard stays exactly as strong as it was: any OTHER path
 * that starts assigning roles fails this test, which is why 4.2 added an
 * allowlist here instead of deleting the check.
 */
const ROLE_WRITERS = ["src/lib/tenant-provisioning.ts"] as const;

const GUARD_NAMES = ["requireOperatorPage", "operatorGate", "requireOperator"];
const OPERATOR_DIR = join(process.cwd(), "src", "app", "operator");

function usesGate(source: string): boolean {
  return GUARD_NAMES.some((name) => new RegExp(`${name}\\s*\\(`).test(source));
}
function relative(file: string): string {
  return file
    .slice(process.cwd().length + 1)
    .split(sep)
    .join("/");
}

/** Shipped TypeScript under `dir`, tests excluded. */
function sourceFiles(dir: string): string[] {
  return walk(dir).filter(
    (file) =>
      /\.tsx?$/.test(file) &&
      !/\.test\.tsx?$/.test(file) &&
      !file.includes(`${sep}node_modules${sep}`)
  );
}

describe("operator surface convention", () => {
  it("walks nested routes, not just the top level", () => {
    // Checked against the dashboard tree, which really has nested segments:
    // a shallow walk would silently leave deeper operator routes unguarded.
    const nested = collectSurfaces(join(process.cwd(), "src", "app", "dashboard"));
    expect(nested.length).toBeGreaterThan(3);
    expect(nested.some((file) => file.split(sep).join("/").includes("/[slug]/"))).toBe(true);
  });

  it("finds the operator surfaces it is supposed to protect", () => {
    const files = collectSurfaces(OPERATOR_DIR);
    expect(files.map(relative)).toContain("src/app/operator/page.tsx");
  });

  it.each(collectSurfaces(OPERATOR_DIR).map((file) => [relative(file), file]))(
    "%s goes through the operator gate",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      expect(usesGate(source), `${file} must call one of ${GUARD_NAMES.join(", ")}`).toBe(true);
    }
  );

  it("rejects a surface that does not call the gate", () => {
    // The guard's own negative case: a page like this must never pass.
    expect(usesGate("export default function Page() { return null; }")).toBe(false);
  });

  it("assigns the global role only from the operator provisioning module", () => {
    // The role a session carries comes from the database, and from nowhere a
    // caller can reach. Creating accounts belongs to operator provisioning
    // (4.2) and to nothing else, so the only module allowed to write here is
    // named in `ROLE_WRITERS` above. A second one appearing is the signal
    // this guard exists to raise.
    const writers = sourceFiles(join(process.cwd(), "src")).filter((file) => {
      const source = readFileSync(file, "utf8");
      return /(insert|update)\(\s*users\s*\)/.test(source) && /role\s*:/.test(source);
    });
    expect(
      writers.map(relative).sort(),
      "assigning users.role belongs to operator provisioning (4.2)"
    ).toEqual([...ROLE_WRITERS].sort());
  });

  it("keeps the gate itself out of client bundles", () => {
    // The gate reads the session; a "use client" module importing it would
    // both leak server logic into the bundle and be unable to check anything.
    const gate = join(process.cwd(), "src", "lib", "operator-access.ts");
    expect(readFileSync(gate, "utf8")).not.toContain('"use client"');
  });
});
