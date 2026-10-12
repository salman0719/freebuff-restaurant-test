import { describe, expect, it } from "vitest";
import { err, isErr, ok } from "./result";

describe("ok", () => {
  it("wraps data with ok: true", () => {
    expect(ok({ slug: "marios" })).toEqual({ ok: true, data: { slug: "marios" } });
  });
});

describe("err", () => {
  it("wraps code and message without fields", () => {
    expect(err("NOT_FOUND", "No such tenant.")).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "No such tenant." },
    });
  });

  it("carries field errors when given", () => {
    const result = err("VALIDATION_FAILED", "Invalid input.", { slug: ["Taken."] });
    expect(result).toEqual({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Invalid input.", fields: { slug: ["Taken."] } },
    });
  });
});

describe("isErr", () => {
  it("narrows success and failure", () => {
    const good = ok(1);
    const bad = err<number>("FORBIDDEN", "Nope.");
    expect(isErr(good)).toBe(false);
    expect(isErr(bad)).toBe(true);
    if (isErr(bad)) {
      expect(bad.error.code).toBe("FORBIDDEN");
    } else {
      expect.unreachable();
    }
  });
});
