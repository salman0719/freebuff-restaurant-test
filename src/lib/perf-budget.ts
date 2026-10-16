/**
 * Client-JS budget for the public route (Phase 6.3) — the pure half.
 *
 * The public page is what a pilot restaurant's first visitor downloads, and
 * it was never measured: `next build` in this project prints no route sizes
 * (Turbopack skips the size table), so nothing said when a new import, a
 * client-only dependency, or a framework bump made that page heavier. A
 * budget only means something if it is checked against a real build, so the
 * enforcement lives in `scripts/perf-budget.ts`, which reads `.next` after
 * `npm run build`; this module holds the rules so they can be unit-tested
 * without a build.
 *
 * What is measured: the `<script src>` tags in the route's prerendered HTML
 * shell (`.next/server/app/index.html` for `/`). That shell is exactly what
 * the browser is handed first, and it is a superset of the route's own client
 * references — the framework, Turbopack runtime, and route chunks all appear
 * there — so it matches what a phone actually requests for the initial load.
 *
 * Why gzip: the transfer a visitor pays is per-file compressed, so gzip size
 * is the honest number to budget; raw bytes are reported alongside because a
 * chunk can be split or merged without changing either meaningfully, and a
 * raw-only budget would fail on cosmetic changes.
 *
 * Pure: no filesystem, no `next/*`, no network.
 */

/** A route whose initial JS is held to a budget. */
export interface RouteBudget {
  /** Route path, for messages. */
  route: string;
  /** Prerendered HTML shell, relative to the build directory. */
  htmlPath: string;
  /** Ceiling on the sum of raw chunk bytes. */
  maxRawBytes: number;
  /** Ceiling on the sum of gzipped chunk bytes — the number that matters. */
  maxGzipBytes: number;
}

/**
 * Baseline measured on commit `7136f87`'s build (Next 16.4.0, React 19.3):
 * 13 chunks, 645,075 raw bytes, 202,132 gzipped bytes. The ceilings sit
 * roughly 8% above so an ordinary change passes while a new client
 * dependency — the regression this exists to catch — does not slip through.
 *
 * Raising these is a real decision, not a formatting fix: do it only with a
 * measured reason recorded alongside (a framework upgrade that pays for
 * itself, for instance), the way `docs/tech-debt/` records its trade-offs.
 */
export const PUBLIC_ROUTE_BUDGET: RouteBudget = {
  route: "/",
  htmlPath: "server/app/index.html",
  maxRawBytes: 700_000,
  maxGzipBytes: 220_000,
};

/**
 * Every static `<script src>` the given HTML references, in document order,
 * deduplicated.
 *
 * Inline scripts are skipped (they ship inside the HTML, not as a request),
 * as is anything outside `/_next/static/` — those are Next's own build
 * artifacts, and an external host's script is somebody else's budget — and
 * any static asset that is not JavaScript, since a `<script src>` pointing
 * at a font would not be this budget's business. Build paths carry no query
 * string, so the extension test runs on the raw value.
 */
export function extractInitialScripts(html: string): string[] {
  const seen = new Set<string>();
  const scripts: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const src = match[1]?.trim();
    if (!src || !src.startsWith("/_next/static/")) continue;
    if (!/\.m?js$/i.test(src)) continue;
    if (seen.has(src)) continue;
    seen.add(src);
    scripts.push(src);
  }
  return scripts;
}

/** One build artifact and what serving it costs. */
export interface MeasuredAsset {
  /** Path as written in the HTML, e.g. `/_next/static/chunks/abc.js`. */
  src: string;
  rawBytes: number;
  gzipBytes: number;
}

export interface BudgetVerdict {
  route: string;
  ok: boolean;
  totalRawBytes: number;
  totalGzipBytes: number;
  /** Largest chunks first — the ones worth reading when this fails. */
  assets: MeasuredAsset[];
  /** Why it failed, empty when it passed. */
  reasons: string[];
}

function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Compare a route's measured chunks against its budget.
 *
 * `missing` — script tags whose file could not be read — always fails the
 * verdict: an unmeasurable build is not a passing one, it is a broken
 * assumption about what ships.
 */
export function evaluateRouteBudget(
  budget: RouteBudget,
  assets: readonly MeasuredAsset[],
  missing: readonly string[] = []
): BudgetVerdict {
  let totalRawBytes = 0;
  let totalGzipBytes = 0;
  for (const asset of assets) {
    totalRawBytes += asset.rawBytes;
    totalGzipBytes += asset.gzipBytes;
  }

  const reasons: string[] = [];
  for (const src of missing) {
    reasons.push(`unmeasured script (file not found in the build): ${src}`);
  }
  if (assets.length === 0 && missing.length === 0) {
    reasons.push("no static scripts found in the route's HTML shell");
  }
  if (totalGzipBytes > budget.maxGzipBytes) {
    reasons.push(`gzip ${kilobytes(totalGzipBytes)} over budget ${kilobytes(budget.maxGzipBytes)}`);
  }
  if (totalRawBytes > budget.maxRawBytes) {
    reasons.push(`raw ${kilobytes(totalRawBytes)} over budget ${kilobytes(budget.maxRawBytes)}`);
  }

  const ordered = [...assets].sort((a, b) => b.gzipBytes - a.gzipBytes);
  return {
    route: budget.route,
    ok: reasons.length === 0,
    totalRawBytes,
    totalGzipBytes,
    assets: ordered,
    reasons,
  };
}
