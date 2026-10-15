/**
 * Route smoke check (Phase 4.1 follow-up) — the HTTP half.
 *
 * Point it at any origin and it asserts what the platform promises: every
 * private path answers with the edge gate's own redirect to the sign-in page,
 * and every public path stays open with a 200. The decision rules live in
 * `src/lib/route-smoke.ts` (pure, unit-tested); this file only fetches and
 * prints.
 *
 * It exists because the gate once failed *silently*: `proxy.ts` sat at the
 * repository root, Next never loaded it, and the page-level check quietly
 * covered for it — anonymous visitors were streamed a redirect inside a 200
 * shell. Nothing in the build said so. So the assertion here is the status
 * code itself: the gate answers 302, a page-level `redirect()` answers 307,
 * and a 200 means nothing bounced the request before rendering.
 *
 * Usage:
 *   npx tsx scripts/smoke.ts                              # http://localhost:4030
 *   npx tsx scripts/smoke.ts https://staging.example.com
 *   npx tsx scripts/smoke.ts https://x --timeout 5000 --redirect-status 302
 *   npx tsx scripts/smoke.ts http://localhost:4031 --wait 60000   # while it boots
 *   SMOKE_ORIGIN=https://x npm run smoke
 *
 * Exit codes: 0 all checks passed, 1 a check failed, 2 the run could not be
 * made (bad usage, or the origin never answered within the `--wait` budget).
 * Authenticated access is out of scope on purpose — a smoke check holds no
 * session; the E2E suite covers signed-in journeys against the real stack.
 */
import {
  DEFAULT_EDGE_STATUSES,
  SIGN_IN_PATH,
  SMOKE_ROUTES,
  evaluateRoute,
  type HttpObservation,
} from "../src/lib/route-smoke";

const DEFAULT_ORIGIN = "http://localhost:4030";
const DEFAULT_TIMEOUT_MS = 10_000;

/** 0 all checks passed, 1 a check failed, 2 the run could not be made. */
const EXIT = { pass: 0, failed: 1, unusable: 2 } as const;

const USAGE = `Route smoke check — point it at any origin.

  npx tsx scripts/smoke.ts [origin] [options]

  origin                  Base URL to probe (default ${DEFAULT_ORIGIN},
                          or $SMOKE_ORIGIN)
  --wait <ms>             Poll until the origin answers before checking
                          (default 0: fail fast when nothing is listening).
                          CI passes this while the app is still booting.
  --timeout <ms>          Per-request timeout (default ${DEFAULT_TIMEOUT_MS})
  --redirect-status <codes>
                          Comma-separated statuses that count as the edge
                          gate's redirect (default ${DEFAULT_EDGE_STATUSES.join("/")}). Only widen this if
                          something in front of the app rewrites the status.
  -h, --help              Show this help
`;

interface Options {
  origin: string;
  timeoutMs: number;
  edgeStatuses: readonly number[];
  /** How long to wait for the origin to answer at all before giving up. */
  waitMs: number;
}

function usageError(message: string): never {
  console.error(`smoke: ${message}\n\n${USAGE}`);
  return process.exit(EXIT.unusable);
}

function nextValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    usageError(`${flag} needs a value.`);
  }
  return value;
}

function parseStatuses(raw: string, flag: string): readonly number[] {
  const statuses = raw.split(",").map((part) => Number(part.trim()));
  if (
    statuses.length === 0 ||
    statuses.some((status) => !Number.isInteger(status) || status < 300 || status > 399)
  ) {
    usageError(`${flag} takes comma-separated 3xx statuses (got "${raw}").`);
  }
  return statuses;
}

function parsePositiveInt(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    usageError(`${flag} takes a positive whole number of milliseconds (got "${raw}").`);
  }
  return value;
}

function parseOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    usageError(`"${raw}" is not a valid http(s) origin.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    usageError(`"${raw}" must be an http(s) origin.`);
  }
  return url.origin;
}

function parseArgs(argv: readonly string[]): Options {
  let origin = parseOrigin(process.env.SMOKE_ORIGIN ?? DEFAULT_ORIGIN);
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let edgeStatuses: readonly number[] = DEFAULT_EDGE_STATUSES;
  let waitMs = 0;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(EXIT.pass);
    }
    if (arg === "--timeout") {
      timeoutMs = parsePositiveInt(nextValue(argv, index, "--timeout"), "--timeout");
      index += 1;
    } else if (arg.startsWith("--timeout=")) {
      timeoutMs = parsePositiveInt(arg.slice("--timeout=".length), "--timeout");
    } else if (arg === "--wait") {
      waitMs = parsePositiveInt(nextValue(argv, index, "--wait"), "--wait");
      index += 1;
    } else if (arg.startsWith("--wait=")) {
      waitMs = parsePositiveInt(arg.slice("--wait=".length), "--wait");
    } else if (arg === "--redirect-status") {
      edgeStatuses = parseStatuses(
        nextValue(argv, index, "--redirect-status"),
        "--redirect-status"
      );
      index += 1;
    } else if (arg.startsWith("--redirect-status=")) {
      edgeStatuses = parseStatuses(arg.slice("--redirect-status=".length), "--redirect-status");
    } else if (arg.startsWith("-")) {
      usageError(`unknown option "${arg}".`);
    } else {
      origin = parseOrigin(arg);
    }
  }

  return { origin, timeoutMs, edgeStatuses, waitMs };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "TimeoutError" ? "timed out" : error.message;
  }
  return String(error);
}

/**
 * One anonymous request. `redirect: "manual"` is load-bearing: following the
 * redirect would report a 200 from the sign-in page and hide the status this
 * check exists to read.
 */
async function observe(origin: string, path: string, timeoutMs: number): Promise<HttpObservation> {
  const response = await fetch(`${origin}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "text/html" },
  });
  const location = response.headers.get("location");
  // Release the connection without reading a body nobody inspects.
  await response.body?.cancel();
  return { status: response.status, location };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until the origin answers *anything*, for the CI case where the app was
 * started moments before this runs. Readiness only needs the socket to be
 * serving: a 404 or 500 still means "up", and judging responses is the route
 * checks' job. Deliberately not a fixed sleep — a fixed one is either too
 * short on a cold CI runner or wasted time on a warm one.
 */
async function waitForOrigin(
  origin: string,
  timeoutMs: number,
  waitMs: number
): Promise<{ ok: true; attempts: number } | { ok: false; detail: string }> {
  const deadline = Date.now() + waitMs;
  const probeTimeout = Math.min(timeoutMs, 2_000);
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      await observe(origin, SIGN_IN_PATH, probeTimeout);
      return { ok: true, attempts };
    } catch (error) {
      if (Date.now() >= deadline) {
        return { ok: false, detail: describeError(error) };
      }
      if (attempts === 1) {
        console.log(`Waiting up to ${waitMs}ms for ${origin} to answer…`);
      }
      await sleep(500);
    }
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv);
  console.log(`Route smoke check — ${options.origin}`);
  console.log(
    `  edge-gate redirect: ${options.edgeStatuses.join("/")}   timeout: ${options.timeoutMs}ms   routes: ${SMOKE_ROUTES.length}\n`
  );

  if (options.waitMs > 0) {
    const ready = await waitForOrigin(options.origin, options.timeoutMs, options.waitMs);
    if (!ready.ok) {
      console.error(
        `Cannot reach ${options.origin}${SIGN_IN_PATH} within ${options.waitMs}ms: ${ready.detail}`
      );
      return EXIT.unusable;
    }
    console.log(`Origin answered after ${ready.attempts} probe(s).\n`);
  }

  let passed = 0;
  const failures: { path: string; reason: string }[] = [];

  for (const [index, route] of SMOKE_ROUTES.entries()) {
    let observation: HttpObservation;
    try {
      observation = await observe(options.origin, route.path, options.timeoutMs);
    } catch (error) {
      const detail = describeError(error);
      if (index === 0) {
        console.error(`Cannot reach ${options.origin}${route.path}: ${detail}`);
        console.error(
          "Start the app under test first (npm run build && npm run start), then point this at it."
        );
        return EXIT.unusable;
      }
      failures.push({ path: route.path, reason: `could not reach: ${detail}` });
      console.log(`  ✗ ${route.kind.padEnd(9)} ${route.path.padEnd(34)} unreachable`);
      continue;
    }

    const verdict = evaluateRoute(route, observation, options.edgeStatuses);
    const head = `  ${verdict.ok ? "✓" : "✗"} ${route.kind.padEnd(9)} ${route.path.padEnd(34)}`;
    if (verdict.ok) {
      passed += 1;
      console.log(`${head} ${verdict.note}`);
    } else {
      failures.push({ path: route.path, reason: verdict.reason });
      console.log(`${head} ${observation.status}`);
      console.log(`      ${verdict.reason}`);
      console.log(`      (${route.reason})`);
    }
  }

  console.log(`\n${SMOKE_ROUTES.length} routes: ${passed} passed, ${failures.length} failed`);
  if (failures.length === 0) {
    console.log("Every private path is bounced by the edge gate; every public path stays open.");
    return EXIT.pass;
  }

  console.error(
    `\nFAILED — ${failures.length} route(s) do not match the platform's promise:\n${failures
      .map((failure) => `  ${failure.path}: ${failure.reason}`)
      .join("\n")}`
  );
  console.error(
    "\nA protected path answering 200 or 307 means the edge gate did not run: check that the " +
      "proxy file sits at the app directory's own level (`src/proxy.ts` here) and that its " +
      "matcher covers the path. A public path redirecting means the gate is too broad."
  );
  return EXIT.failed;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`smoke: unexpected failure — ${describeError(error)}`);
    process.exitCode = EXIT.unusable;
  });
