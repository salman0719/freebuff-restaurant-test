/**
 * Liveness/readiness probe (Phase 6.2). Intentionally unauthenticated: load
 * balancers and uptime monitors must reach it without a session, and the
 * body carries only check names plus booleans — no versions, no driver
 * messages, nothing an attacker can learn from.
 *
 * Failures are logged server-side (redacted) so they are actionable
 * without being exposed: the response says "degraded", the log says what
 * the driver actually reported.
 */
import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "../../../../db";
import { runHealthChecks, type HealthProbes } from "@/lib/health";
import { logServerEvent } from "@/lib/server-log";
import { probeStorage } from "@/lib/storage";

async function pingDatabase(): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

export async function GET(): Promise<Response> {
  // Health answers from live probes, never a prerender: `await connection()`
  // is the `cacheComponents`-compatible opt-out (same as the auth route).
  // It only runs inside a request scope, so the check logic lives in
  // `healthResponse` where tests can call it with fake probes.
  await connection();
  return healthResponse({ database: pingDatabase, storage: probeStorage });
}

/** Run the probes and map the report to a coarse HTTP answer. */
export async function healthResponse(probes: HealthProbes): Promise<Response> {
  const report = await runHealthChecks(probes);
  if (report.status !== "ok") {
    const down = report.checks
      .filter((check) => !check.ok)
      .map((check) => check.name)
      .join(",");
    logServerEvent({
      event: "health.degraded",
      level: "warn",
      message: `Health check degraded: ${down} unavailable.`,
      context: { down },
    });
    return Response.json(report, { status: 503 });
  }
  return Response.json(report, { status: 200 });
}
