/**
 * Unique-violation predicate tests. These exist because the predicate was
 * silently wrong: it checked only the error it was handed, and the error
 * Drizzle hands over is a wrapper that carries no SQLSTATE. The shapes below
 * are the real ones — see the module note in `db-errors.ts`.
 */
import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./db-errors";

/** A `postgres.js` error as it actually arrives. */
function postgresError(code: string): Error & { code: string } {
  const error = new Error("duplicate key value violates unique constraint") as Error & {
    code: string;
  };
  error.code = code;
  return error;
}

/** The wrapper `drizzle-orm` raises around a failed statement. */
function drizzleQueryError(cause: unknown): Error {
  const error = new Error("Failed query: insert into …") as Error & { cause?: unknown };
  error.name = "DrizzleQueryError";
  error.cause = cause;
  return error;
}

describe("isUniqueViolation", () => {
  it("matches a bare driver error", () => {
    expect(isUniqueViolation(postgresError("23505"))).toBe(true);
  });

  it("matches the code when Drizzle has wrapped it", () => {
    // The case that made the original predicate a no-op.
    expect(isUniqueViolation(drizzleQueryError(postgresError("23505")))).toBe(true);
  });

  it("matches through several nested causes", () => {
    const nested = drizzleQueryError(drizzleQueryError(postgresError("23505")));
    expect(isUniqueViolation(nested)).toBe(true);
  });

  it("ignores other SQLSTATEs", () => {
    expect(isUniqueViolation(postgresError("23503"))).toBe(false);
    expect(isUniqueViolation(drizzleQueryError(postgresError("23514")))).toBe(false);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "23505"],
    ["a number", 23505],
    ["a bare Error", new Error("boom")],
    ["an object with no code or cause", { message: "boom" }],
  ])("refuses to match %s", (_label, value) => {
    expect(isUniqueViolation(value)).toBe(false);
  });

  it("stops walking a cause cycle instead of looping forever", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    a.cause = a;
    expect(isUniqueViolation(a)).toBe(false);
  });
});
