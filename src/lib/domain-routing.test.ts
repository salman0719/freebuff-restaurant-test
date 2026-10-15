/**
 * Domain-routing unit tests (Phase 5.3). The fold (`resolveRouting`) is
 * the heart of "never say live early", so its whole truth table is
 * pinned here; the seams (probe, Vercel client) run as fakes, so nothing
 * touches the network or a real project.
 */
import { describe, expect, it } from "vitest";
import {
  connectRouting,
  disconnectRouting,
  getRoutingStatus,
  probeHttps,
  resolveRouting,
  type ProbeResult,
} from "./domain-routing";
import type { FetchLike } from "./vercel";

const CONFIG = { token: "vercel_secret_token_xyz", projectId: "prj_test_123" };

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    json: async () => body,
  } as Response;
}

function apiFetch(responses: { status: number; body?: unknown }[]): FetchLike {
  return async () => {
    const next = responses.shift();
    if (!next) throw new Error("no queued response");
    return jsonResponse(next.status, next.body ?? null);
  };
}

describe("resolveRouting (the truth table)", () => {
  it("is detached whenever the domain is not attached, whatever else holds", () => {
    expect(resolveRouting({ attached: false, vercelVerified: false, probe: null }).status).toBe(
      "detached"
    );
    // Even a passing probe must not read as live for an unattached domain.
    expect(resolveRouting({ attached: false, vercelVerified: true, probe: "online" }).status).toBe(
      "detached"
    );
  });

  it("is pending while Vercel has not validated the domain", () => {
    const status = resolveRouting({ attached: true, vercelVerified: false, probe: "online" });
    expect(status.status).toBe("pending");
    expect(status.message).toContain("DNS");
  });

  it("is pending between validation and a working HTTPS probe", () => {
    for (const probe of ["offline", null] as (ProbeResult | null)[]) {
      const status = resolveRouting({ attached: true, vercelVerified: true, probe });
      expect(status.status).toBe("pending");
      expect(status.message).toContain("HTTPS");
    }
  });

  it("is live only when every fact holds", () => {
    const status = resolveRouting({ attached: true, vercelVerified: true, probe: "online" });
    expect(status.status).toBe("live");
    expect(status.message).toContain("Live");
  });

  it("never says 'Live' in any other state", () => {
    const combinations = [
      { attached: false, vercelVerified: false, probe: null },
      { attached: false, vercelVerified: true, probe: "online" },
      { attached: true, vercelVerified: false, probe: "online" },
      { attached: true, vercelVerified: true, probe: "offline" },
      { attached: true, vercelVerified: true, probe: null },
    ] as const;
    for (const facts of combinations) {
      expect(resolveRouting(facts).message).not.toContain("Live —");
    }
  });
});

describe("probeHttps", () => {
  it("is online when any HTTP exchange completes — the status code is irrelevant", async () => {
    for (const status of [200, 404, 500]) {
      const fetchImpl: FetchLike = async () => jsonResponse(status, {});
      await expect(probeHttps("shop.example.com", fetchImpl)).resolves.toBe("online");
    }
  });

  it("is offline for DNS failures, refused connections, and TLS errors alike", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(probeHttps("shop.example.com", fetchImpl)).resolves.toBe("offline");
  });
});

describe("connectRouting / disconnectRouting", () => {
  it("attaches and reports Vercel's verification flag", async () => {
    const fetchImpl = apiFetch([
      { status: 200, body: { name: "shop.example.com", verified: false } },
    ]);
    const result = await connectRouting("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result).toEqual({ ok: true, data: { attached: true, vercelVerified: false } });
  });

  it("propagates a 409 as CONFLICT instead of a vague failure", async () => {
    const fetchImpl = apiFetch([
      {
        status: 409,
        body: { error: { message: "The domain is already assigned to another Vercel project" } },
      },
    ]);
    const result = await connectRouting("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return expect.unreachable();
    expect(result.error.code).toBe("CONFLICT");
  });

  it("treats an already-detached domain as successfully disconnected", async () => {
    const fetchImpl = apiFetch([{ status: 404, body: null }]);
    const result = await disconnectRouting("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result).toEqual({ ok: true, data: { detached: true } });
  });
});

describe("getRoutingStatus", () => {
  it("reports live only from attached + verified + probe online", async () => {
    const fetchImpl = apiFetch([
      { status: 200, body: { domains: [{ name: "shop.example.com", verified: true }] } },
    ]);
    const probe = async (): Promise<ProbeResult> => "online";
    const result = await getRoutingStatus("shop.example.com", { config: CONFIG, fetchImpl, probe });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("live");
  });

  it("stays pending when validation is missing even if the probe answers", async () => {
    const fetchImpl = apiFetch([
      { status: 200, body: { domains: [{ name: "shop.example.com", verified: false }] } },
    ]);
    const probe = async (): Promise<ProbeResult> => "online";
    const result = await getRoutingStatus("shop.example.com", { config: CONFIG, fetchImpl, probe });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("pending");
  });

  it("is detached when the project does not hold the domain", async () => {
    const fetchImpl = apiFetch([{ status: 200, body: { domains: [] } }]);
    const probe = async (): Promise<ProbeResult> => "online";
    const result = await getRoutingStatus("shop.example.com", { config: CONFIG, fetchImpl, probe });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("detached");
  });

  it("carries a Vercel read failure through as an error, not a state", async () => {
    const fetchImpl = apiFetch([{ status: 403, body: { error: { message: "Denied" } } }]);
    const result = await getRoutingStatus("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return expect.unreachable();
    expect(result.error.message).toBe("Denied");
  });
});
