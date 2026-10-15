/**
 * Domain-claim unit tests (Phase 5.2). Everything here is pure or fails
 * BEFORE any database access — the live flows (submit/write/DNS against a
 * real database) live in `domain-claim-live.test.ts` behind
 * `TEST_DATABASE_URL`.
 */
import { describe, expect, it } from "vitest";
import type { TenantContext } from "./tenant-context";
import {
  VERIFY_RECORD_LABEL,
  matchesVerification,
  submitDomainClaim,
  toDomainClaim,
  verificationRecordName,
} from "./domain-claim";

const ctx: TenantContext = {
  tenant: {
    id: "tenant_a",
    slug: "marios",
    customDomain: null,
    published: false,
    theme: "cafe",
    themeConfig: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  membership: {
    id: "membership_1",
    userId: "user_1",
    tenantId: "tenant_a",
    role: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

describe("verificationRecordName", () => {
  it("builds the exact TXT record the owner must publish", () => {
    expect(verificationRecordName("shop.example.com")).toBe(
      "_restaurant-platform.shop.example.com"
    );
    expect(VERIFY_RECORD_LABEL).toBe("_restaurant-platform");
  });
});

describe("matchesVerification", () => {
  const token = "rc-token-1234";

  it("matches the exact token", () => {
    expect(matchesVerification([[token]], token)).toBe(true);
  });

  it("joins TXT chunks split at 255 characters", () => {
    const head = token.slice(0, 10);
    const tail = token.slice(10);
    expect(matchesVerification([[head, tail]], token)).toBe(true);
  });

  it("trims surrounding whitespace an operator's DNS panel may add", () => {
    expect(matchesVerification([[`  ${token}\n`]], token)).toBe(true);
  });

  it("refuses a wrong value, an empty answer, or a missing token", () => {
    expect(matchesVerification([["something-else"]], token)).toBe(false);
    expect(matchesVerification([], token)).toBe(false);
    expect(matchesVerification([[token]], null)).toBe(false);
  });

  it("matches any one record, not only the first", () => {
    expect(matchesVerification([["google-site-verification=abc"], [token]], token)).toBe(true);
  });

  it("refuses a token wrapped in quotes — the proof is exact", () => {
    // `dns.resolveTxt` returns unquoted content, so quotes around the
    // value mean the record LITERALLY contains them — not our token.
    expect(matchesVerification([[`\"${token}\"`]], token)).toBe(false);
  });
});

describe("toDomainClaim", () => {
  it("reports a domain-less row as the empty claim", () => {
    expect(
      toDomainClaim({
        customDomain: null,
        customDomainStatus: "none",
        customDomainVerifyToken: null,
      })
    ).toEqual({ domain: null, status: "none", verifyToken: null });
  });

  it("passes pending and verified claims through", () => {
    expect(
      toDomainClaim({
        customDomain: "shop.example.com",
        customDomainStatus: "pending",
        customDomainVerifyToken: "tok",
      })
    ).toEqual({ domain: "shop.example.com", status: "pending", verifyToken: "tok" });
    expect(
      toDomainClaim({
        customDomain: "shop.example.com",
        customDomainStatus: "verified",
        customDomainVerifyToken: "tok",
      })
    ).toEqual({ domain: "shop.example.com", status: "verified", verifyToken: "tok" });
  });

  it("never reports a state without a domain, whatever the columns hold", () => {
    // The schema CHECKs keep these together; this pins the reader's
    // defensive behaviour if a row ever slipped past them.
    expect(
      toDomainClaim({
        customDomain: null,
        customDomainStatus: "verified",
        customDomainVerifyToken: "tok",
      })
    ).toEqual({ domain: null, status: "none", verifyToken: null });
  });
});

describe("submitDomainClaim validation (fails before any database access)", () => {
  it.each([
    [undefined, "undefined"],
    [null, "null"],
    ["", "empty string"],
    ["not a host!!", "spaces and punctuation"],
    ["ftp://shop.example.com", "a URL, not a hostname"],
    ["x".repeat(300), "over the 253-char hostname limit"],
  ])("rejects %s (%s) keyed to the domain field", async (input, label) => {
    const result = await submitDomainClaim(ctx, input);
    expect(result.ok, label).toBe(false);
    if (result.ok) return expect.unreachable();
    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(result.error.fields ?? {})).toEqual(["domain"]);
  });
});
