import { describe, expect, it } from "vitest";
import { healthResponse } from "@/app/api/health/route";
import { runHealthChecks } from "./health";

const passing = () => Promise.resolve();
const failing = () => Promise.reject(new Error("connection refused: postgres://u:p@host/db"));

describe("runHealthChecks", () => {
  it("reports ok when every probe passes", async () => {
    const report = await runHealthChecks({ database: passing, storage: passing });
    expect(report.status).toBe("ok");
    expect(report.checks).toEqual([
      { name: "database", ok: true, latencyMs: expect.any(Number) },
      { name: "storage", ok: true, latencyMs: expect.any(Number) },
    ]);
  });

  it("reports degraded when any probe fails, without the driver's message", async () => {
    const report = await runHealthChecks({ database: failing, storage: passing });
    expect(report.status).toBe("degraded");
    expect(report.checks.find((check) => check.name === "database")?.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain("postgres://");
    expect(JSON.stringify(report)).not.toContain("connection refused");
  });

  it("treats a hung probe as down instead of hanging the report", async () => {
    const hanging = () => new Promise<void>(() => {});
    const report = await runHealthChecks({ database: hanging, storage: passing });
    expect(report.checks.find((check) => check.name === "database")?.ok).toBe(false);
    expect(report.status).toBe("degraded");
  }, 10_000);
});

describe("healthResponse", () => {
  async function bodyOf(probes: { database: () => Promise<void>; storage: () => Promise<void> }) {
    const response = await healthResponse(probes);
    const body = (await response.json()) as {
      status: string;
      checks: { name: string; ok: boolean; latencyMs: number }[];
    };
    return { response, body };
  }

  it("answers 200 with a coarse ok report when every probe passes", async () => {
    const { response, body } = await bodyOf({ database: passing, storage: passing });
    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.map((check) => check.name).sort()).toEqual(["database", "storage"]);
  });

  it("answers 503 with no internal details when a probe fails", async () => {
    const { response, body } = await bodyOf({ database: failing, storage: passing });
    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    const raw = JSON.stringify(body);
    for (const leaked of ["postgres", "DATABASE_URL", "token", "stack", "Error"]) {
      expect(raw).not.toContain(leaked);
    }
  });
});
