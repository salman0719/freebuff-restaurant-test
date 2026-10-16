import { describe, expect, it, vi } from "vitest";
import { formatLogEvent, logServerEvent, sanitizeForLog } from "./server-log";

describe("sanitizeForLog", () => {
  it("passes safe primitives through", () => {
    expect(sanitizeForLog("hello")).toBe("hello");
    expect(sanitizeForLog(42)).toBe(42);
    expect(sanitizeForLog(true)).toBe(true);
    expect(sanitizeForLog(null)).toBe(null);
    expect(sanitizeForLog(undefined)).toBe(undefined);
  });

  it("redacts credential keys case-insensitively, at any depth", () => {
    const cleaned = sanitizeForLog({
      VERCEL_TOKEN: "abc",
      nested: { Auth_Secret: "xyz", keep: "yes" },
      database_url: "postgres://u:p@h/db",
      cookie: "session=1",
      authorization: "Bearer 1",
    }) as Record<string, unknown>;
    expect(cleaned["VERCEL_TOKEN"]).toBe("[redacted]");
    expect(cleaned["database_url"]).toBe("[redacted]");
    expect(cleaned["cookie"]).toBe("[redacted]");
    expect(cleaned["authorization"]).toBe("[redacted]");
    expect((cleaned["nested"] as Record<string, unknown>)["Auth_Secret"]).toBe("[redacted]");
    expect((cleaned["nested"] as Record<string, unknown>)["keep"]).toBe("yes");
  });

  it("keeps operational identifiers while redacting around them", () => {
    const cleaned = sanitizeForLog({
      slug: "marios-pizza",
      tenantId: "123",
      outcome: "detached",
      password: "hunter2",
    }) as Record<string, unknown>;
    expect(cleaned["slug"]).toBe("marios-pizza");
    expect(cleaned["password"]).toBe("[redacted]");
  });

  it("truncates long strings and caps breadth and depth", () => {
    expect(sanitizeForLog("x".repeat(2000))).toMatch(/\[truncated\]$/);
    const wide = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeForLog(wide) as object)).toHaveLength(50);
    const deep: { next?: unknown } = {};
    let cursor = deep;
    for (let i = 0; i < 10; i += 1) {
      cursor.next = {};
      cursor = cursor.next as { next?: unknown };
    }
    expect(JSON.stringify(sanitizeForLog(deep))).toContain("[too deep]");
  });

  it("cuts circular references instead of throwing", () => {
    const loop: Record<string, unknown> = { a: 1 };
    loop["self"] = loop;
    expect(() => sanitizeForLog(loop)).not.toThrow();
  });
});

describe("formatLogEvent", () => {
  it("emits one JSON line with timestamp, level, event, and message", () => {
    const line = formatLogEvent(
      { event: "health.db.down", level: "error", message: "db unreachable" },
      new Date("2026-10-16T00:00:00.000Z")
    );
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed["ts"]).toBe("2026-10-16T00:00:00.000Z");
    expect(parsed["level"]).toBe("error");
    expect(parsed["event"]).toBe("health.db.down");
    expect(parsed["message"]).toBe("db unreachable");
    expect("context" in parsed).toBe(false);
  });

  it("sanitises context before serialising", () => {
    const line = formatLogEvent({
      event: "test",
      level: "info",
      message: "m",
      context: { slug: "a", VERCEL_TOKEN: "abc" },
    });
    const parsed = JSON.parse(line) as { context: Record<string, unknown> };
    expect(parsed.context["slug"]).toBe("a");
    expect(parsed.context["VERCEL_TOKEN"]).toBe("[redacted]");
  });
});

describe("logServerEvent", () => {
  it("routes info to stdout and warn/error to stderr", () => {
    const sink = { stdout: vi.fn(), stderr: vi.fn() };
    logServerEvent({ event: "a", level: "info", message: "m" }, { sink });
    logServerEvent({ event: "b", level: "warn", message: "m" }, { sink });
    logServerEvent({ event: "c", level: "error", message: "m" }, { sink });
    expect(sink.stdout).toHaveBeenCalledTimes(1);
    expect(sink.stderr).toHaveBeenCalledTimes(2);
  });

  it("never throws when the sink fails", () => {
    const sink = {
      stdout: () => {
        throw new Error("broken");
      },
      stderr: () => {
        throw new Error("broken");
      },
    };
    expect(() => logServerEvent({ event: "a", level: "error", message: "m" }, { sink })).not.toThrow();
  });
});
