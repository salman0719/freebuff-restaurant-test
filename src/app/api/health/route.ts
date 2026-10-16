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
import { mkdir } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db } from "../../../../db";
import { runHealthChecks } from "@/lib/health";
import { logServerEvent } from "@/lib/server-log";
import { storageDir } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function pingDatabase(): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

async function probeStorage(): Promise<void> {
  await mkdir(storageDir(), { recursive: true });
}

export async function GET(): Promise<Response> {
  const report = await runHealthChecks({ database: pingDatabase, storage: probeStorage });
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
