/**
 * Health checks (Phase 6.2). The orchestration is pure-ish: probes are
 * injected, so every state (healthy, down, slow) is unit-tested without a
 * database. `src/app/api/health/route.ts` wires the real probes.
 *
 * The report is deliberately coarse — each check answers only `ok` plus a
 * latency. Driver messages, stack traces, and connection strings stay
 * server-side (logged, redacted, via `server-log`); a load balancer or
 * uptime probe learns "degraded", never why in the driver's own words.
 */

export type HealthStatus = "ok" | "degraded";

export interface HealthCheckResult {
  name: string;
  ok: boolean;
  latencyMs: number;
}

export interface HealthReport {
  status: HealthStatus;
  checks: HealthCheckResult[];
}

/** Per-probe budget: slower than this counts as down, not as slow. */
export const HEALTH_PROBE_TIMEOUT_MS = 5_000;

export type Probe = () => Promise<void>;

export interface HealthProbes {
  database: Probe;
  storage: Probe;
}

function timedOut(name: string): Error {
  return new Error(`health probe "${name}" timed out`);
}

export function withTimeout(probe: Probe, ms: number, name: string): Probe {
  return () =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(timedOut(name)), ms);
      probe().then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
}

async function runProbe(name: string, probe: Probe): Promise<HealthCheckResult> {
  const started = Date.now();
  try {
    await withTimeout(probe, HEALTH_PROBE_TIMEOUT_MS, name)();
    return { name, ok: true, latencyMs: Date.now() - started };
  } catch {
    // The cause is logged by the caller with redaction; the report
    // carries only the boolean — never the driver's message.
    return { name, ok: false, latencyMs: Date.now() - started };
  }
}

/** Run every probe; one failure degrades the whole report. */
export async function runHealthChecks(probes: HealthProbes): Promise<HealthReport> {
  const checks = await Promise.all([
    runProbe("database", probes.database),
    runProbe("storage", probes.storage),
  ]);
  return { status: checks.every((check) => check.ok) ? "ok" : "degraded", checks };
}
