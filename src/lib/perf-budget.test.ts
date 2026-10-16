import { describe, expect, it } from "vitest";
import {
  PUBLIC_ROUTE_BUDGET,
  evaluateRouteBudget,
  extractInitialScripts,
  type MeasuredAsset,
} from "./perf-budget";

function asset(src: string, rawBytes: number, gzipBytes = Math.round(rawBytes / 3)): MeasuredAsset {
  return { src, rawBytes, gzipBytes };
}

describe("extractInitialScripts", () => {
  it("collects static script sources in document order, deduplicated", () => {
    const html = `
      <script src="/_next/static/chunks/a.js" async=""></script>
      <script defer src="/_next/static/chunks/b.js"></script>
      <script src="/_next/static/chunks/a.js"></script>
    `;
    expect(extractInitialScripts(html)).toEqual([
      "/_next/static/chunks/a.js",
      "/_next/static/chunks/b.js",
    ]);
  });

  it("finds src wherever it sits in the tag, single-quoted included", () => {
    expect(
      extractInitialScripts(`<script data-x="1" src="/_next/static/chunks/c.js"></script>`)
    ).toEqual(["/_next/static/chunks/c.js"]);
    expect(
      extractInitialScripts(`<script defer src='/_next/static/chunks/d.js'></script>`)
    ).toEqual(["/_next/static/chunks/d.js"]);
  });

  it("skips inline scripts and anything outside the build output", () => {
    const html = `
      <script>window.__BOOT__ = 1</script>
      <script src="https://cdn.example.com/analytics.js"></script>
      <script src="/_next/static/media/font.woff2"></script>
      <script src="/_next/static/chunks/e.js"></script>
    `;
    expect(extractInitialScripts(html)).toEqual(["/_next/static/chunks/e.js"]);
  });

  it("returns an empty list for HTML with no scripts at all", () => {
    expect(extractInitialScripts("<!doctype html><html><body>hi</body></html>")).toEqual([]);
  });
});

describe("evaluateRouteBudget", () => {
  it("passes at the recorded baseline", () => {
    // The numbers the budget was pinned against (commit 7136f87's build),
    // rounded to the totals in bytes.
    const baseline: MeasuredAsset[] = [asset("/_next/static/chunks/a.js", 645_075, 202_132)];
    const verdict = evaluateRouteBudget(PUBLIC_ROUTE_BUDGET, baseline);
    expect(verdict.ok).toBe(true);
    expect(verdict.reasons).toEqual([]);
    expect(verdict.totalRawBytes).toBe(645_075);
    expect(verdict.totalGzipBytes).toBe(202_132);
  });

  it("fails when the gzipped total crosses the ceiling", () => {
    const verdict = evaluateRouteBudget(PUBLIC_ROUTE_BUDGET, [
      asset("/_next/static/chunks/big.js", 400_000, 230_000),
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join("\n")).toContain("gzip");
    expect(verdict.reasons.join("\n")).toContain("over budget");
  });

  it("fails when only the raw total crosses the ceiling", () => {
    const verdict = evaluateRouteBudget(PUBLIC_ROUTE_BUDGET, [
      asset("/_next/static/chunks/split.js", 720_000, 100_000),
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join("\n")).toContain("raw");
  });

  it("totals across chunks rather than judging any single one", () => {
    const chunks = [
      asset("/_next/static/chunks/1.js", 200_000, 80_000),
      asset("/_next/static/chunks/2.js", 200_000, 80_000),
      asset("/_next/static/chunks/3.js", 200_000, 80_000),
    ];
    const verdict = evaluateRouteBudget(PUBLIC_ROUTE_BUDGET, chunks);
    expect(verdict.totalGzipBytes).toBe(240_000);
    expect(verdict.ok).toBe(false);
  });

  it("fails when a script could not be measured", () => {
    const verdict = evaluateRouteBudget(PUBLIC_ROUTE_BUDGET, [], ["/_next/static/chunks/gone.js"]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join("\n")).toContain("unmeasured script");
  });

  it("fails when the shell references no scripts at all", () => {
    // A route that ships zero JS means the shell was not the one we think it
    // is — that is a broken assumption, not a very fast page.
    const verdict = evaluateRouteBudget(PUBLIC_ROUTE_BUDGET, []);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join("\n")).toContain("no static scripts");
  });

  it("orders the report largest-first so a failure points at the culprit", () => {
    const verdict = evaluateRouteBudget(PUBLIC_ROUTE_BUDGET, [
      asset("/_next/static/chunks/small.js", 1_000, 500),
      asset("/_next/static/chunks/huge.js", 500_000, 150_000),
      asset("/_next/static/chunks/mid.js", 90_000, 30_000),
    ]);
    expect(verdict.assets.map((entry) => entry.src)).toEqual([
      "/_next/static/chunks/huge.js",
      "/_next/static/chunks/mid.js",
      "/_next/static/chunks/small.js",
    ]);
  });
});
