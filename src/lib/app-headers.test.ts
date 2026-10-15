import { describe, expect, it } from "vitest";
import { APP_SECURITY_HEADERS } from "./app-headers";

describe("APP_SECURITY_HEADERS", () => {
  it("sets each header exactly once, with no placeholder values left", () => {
    const keys = APP_SECURITY_HEADERS.map((header) => header.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const header of APP_SECURITY_HEADERS) {
      expect(header.value.trim()).not.toBe("");
      expect(header.value).not.toMatch(/TODO|CHANGEME|\$\{/i);
    }
  });

  it("pins the baseline responses must carry (Phase 6.1)", () => {
    expect(APP_SECURITY_HEADERS).toEqual([
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ]);
  });

  it("keeps HSTS long enough to be meaningful and covers subdomains", () => {
    const hsts = APP_SECURITY_HEADERS.find((header) => header.key === "Strict-Transport-Security");
    const maxAge = Number(hsts?.value.match(/max-age=(\d+)/)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts?.value).toContain("includeSubDomains");
  });

  it("does not set a page CSP here — that needs a nonce pipeline, not a header", () => {
    // Pinned as a decision: a bare `default-src 'self'` would break Next's
    // inline bootstrap scripts, so the page CSP is deliberately left for its
    // own change. The image route sets its own for uploaded bytes.
    expect(APP_SECURITY_HEADERS.map((header) => header.key)).not.toContain(
      "Content-Security-Policy"
    );
  });
});
