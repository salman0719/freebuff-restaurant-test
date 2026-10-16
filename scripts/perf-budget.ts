/**
 * Client-JS budget check (Phase 6.3) — the measurement half.
 *
 * Reads the build output and asserts that a route's initial JavaScript
 * stays under the ceiling recorded in `src/lib/perf-budget.ts`. It exists
 * because nothing else in this repo would notice a heavier public page:
 * `next build` prints no sizes under Turbopack, `npm run check` stops at
 * lint/type/format, and the unit suite runs before the build exists. So it
 * runs after `npm run build` — locally, and as a CI step beside the route
 * smoke check.
 *
 * The decision rules are pure and unit-tested in `src/lib/perf-budget.ts`;
 * this file only reads, gzips, prints, and picks an exit code.
 *
 * Usage:
 *   npx tsx scripts/perf-budget.ts                     # against .next/
 *   npx tsx scripts/perf-budget.ts --build-dir .next
 *   npm run perf:budget
 *
 * Exit codes: 0 within budget, 1 over budget, 2 the run could not be made
 * (no build output to measure).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  PUBLIC_ROUTE_BUDGET,
  evaluateRouteBudget,
  extractInitialScripts,
  type MeasuredAsset,
} from "../src/lib/perf-budget";

const EXIT = { pass: 0, over: 1, unusable: 2 } as const;

const USAGE = `Client-JS budget check — measure a built route against its ceiling.

  npx tsx scripts/perf-budget.ts [options]

  --build-dir <dir>   Build output to read (default .next)
  -h, --help          Show this help
`;

function usageError(message: string): never {
  console.error(`perf-budget: ${message}\n\n${USAGE}`);
  return process.exit(EXIT.unusable);
}

function parseArgs(argv: readonly string[]): { buildDir: string } {
  let buildDir = ".next";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(EXIT.pass);
    }
    if (arg === "--build-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) usageError("--build-dir needs a value.");
      buildDir = value;
      index += 1;
    } else if (arg.startsWith("--build-dir=")) {
      buildDir = arg.slice("--build-dir=".length);
    } else {
      usageError(`unknown option "${arg}".`);
    }
  }
  return { buildDir };
}

function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function pad(value: string, width: number): string {
  return value.padStart(width);
}

function main(argv: readonly string[]): number {
  const { buildDir } = parseArgs(argv);
  const budget = PUBLIC_ROUTE_BUDGET;
  const htmlPath = path.join(buildDir, budget.htmlPath);

  if (!fs.existsSync(htmlPath)) {
    console.error(`perf-budget: no build output at ${htmlPath} — run \`npm run build\` first.`);
    return EXIT.unusable;
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const scripts = extractInitialScripts(html);

  const assets: MeasuredAsset[] = [];
  const missing: string[] = [];
  for (const src of scripts) {
    // `/_next/static/...` maps to `<build>/static/...`.
    const file = path.join(buildDir, src.replace(/^\/_next\//, ""));
    if (!fs.existsSync(file)) {
      missing.push(src);
      continue;
    }
    const raw = fs.readFileSync(file);
    assets.push({
      src,
      rawBytes: raw.length,
      gzipBytes: zlib.gzipSync(raw, { level: 9 }).length,
    });
  }

  const verdict = evaluateRouteBudget(budget, assets, missing);

  console.log(
    `Client-JS budget — route ${budget.route} (${assets.length} chunk${assets.length === 1 ? "" : "s"})`
  );
  console.log(
    `  raw ${kilobytes(verdict.totalRawBytes)} / budget ${kilobytes(budget.maxRawBytes)}` +
      `   gzip ${kilobytes(verdict.totalGzipBytes)} / budget ${kilobytes(budget.maxGzipBytes)}\n`
  );

  const nameWidth = Math.min(
    60,
    Math.max(12, ...assets.map((entry) => entry.src.replace("/_next/static/", "").length))
  );
  console.log(`  ${"chunk".padEnd(nameWidth)} ${pad("raw", 10)} ${pad("gzip", 10)}`);
  for (const entry of assets) {
    const name = entry.src.replace("/_next/static/", "");
    console.log(
      `  ${name.padEnd(nameWidth).slice(0, nameWidth)} ${pad(kilobytes(entry.rawBytes), 10)} ${pad(
        kilobytes(entry.gzipBytes),
        10
      )}`
    );
  }

  if (verdict.ok) {
    console.log("\nPASS — within budget.");
    return EXIT.pass;
  }

  console.log("\nFAIL — client JS over budget:");
  for (const reason of verdict.reasons) {
    console.log(`  - ${reason}`);
  }
  console.log(
    "\n  Either the change is worth it (raise the ceiling deliberately, with the" +
      "\n  measured reason recorded beside it) or it is a regression this check" +
      "\n  caught before a visitor paid for it."
  );
  return EXIT.over;
}

process.exitCode = main(process.argv.slice(2));
