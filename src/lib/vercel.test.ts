/**
 * Vercel client unit tests (Phase 5.3). Every path runs against an
 * injected fake fetch — no network, no real project — and every failure
 * assertion doubles as a check that the token never leaks into a
 * message.
 */
import { describe, expect, it } from "vitest";
import {
  addProjectDomain,
  getProjectDomain,
  removeProjectDomain,
  vercelConfig,
  type FetchLike,
} from "./vercel";

const CONFIG = { token: "vercel_secret_token_xyz", projectId: "prj_test_123" };

interface RecordedCall {
  url: string;
  method: string;
}

function fakeFetch(responses: { status: number; body?: unknown }[]): {
  fetchImpl: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ url: input, method: init?.method ?? "GET" });
    const next = responses.shift();
    if (!next) throw new Error("no queued response");
    return {
      status: next.status,
      json: async () => next.body ?? null,
    } as Response;
  };
  return { fetchImpl, calls };
}

function expectNoTokenLeak(result: unknown): void {
  expect(JSON.stringify(result)).not.toContain(CONFIG.token);
}

describe("vercelConfig", () => {
  it("reads the token and project id from the environment", () => {
    const previous = { token: process.env.VERCEL_TOKEN, projectId: process.env.VERCEL_PROJECT_ID };
    process.env.VERCEL_TOKEN = "tok";
    process.env.VERCEL_PROJECT_ID = "prj";
    try {
      expect(vercelConfig()).toEqual({ token: "tok", projectId: "prj" });
    } finally {
      process.env.VERCEL_TOKEN = previous.token;
      process.env.VERCEL_PROJECT_ID = previous.projectId;
    }
  });

  it("reports null when either value is missing", () => {
    const previous = { token: process.env.VERCEL_TOKEN, projectId: process.env.VERCEL_PROJECT_ID };
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;
    try {
      expect(vercelConfig()).toBeNull();
    } finally {
      process.env.VERCEL_TOKEN = previous.token;
      process.env.VERCEL_PROJECT_ID = previous.projectId;
    }
  });
});

describe("addProjectDomain", () => {
  it("attaches a new domain and reports Vercel's verification flag", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { status: 200, body: { name: "shop.example.com", verified: false } },
    ]);
    const result = await addProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result).toEqual({
      ok: true,
      data: { name: "shop.example.com", verified: false, alreadyAttached: false },
    });
    expect(calls).toEqual([
      {
        url: "https://api.vercel.com/v10/projects/prj_test_123/domains",
        method: "POST",
      },
    ]);
  });

  it("treats 400-already-attached as success after confirming through the list", async () => {
    const { fetchImpl } = fakeFetch([
      { status: 400, body: { error: { message: "Domain already exists" } } },
      {
        status: 200,
        body: { domains: [{ name: "shop.example.com", verified: true }] },
      },
    ]);
    const result = await addProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result).toEqual({
      ok: true,
      data: { name: "shop.example.com", verified: true, alreadyAttached: true },
    });
  });

  it("fails honestly when 400 means something else entirely", async () => {
    const { fetchImpl } = fakeFetch([
      { status: 400, body: { error: { message: "Domain is not allowed." } } },
      { status: 200, body: { domains: [] } },
    ]);
    const result = await addProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return expect.unreachable();
    expect(result.error.message).toContain("not allowed");
    expectNoTokenLeak(result);
  });

  it("maps the documented 409 to a CONFLICT", async () => {
    const { fetchImpl } = fakeFetch([
      {
        status: 409,
        body: { error: { message: "The domain is already assigned to another Vercel project" } },
      },
    ]);
    const result = await addProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return expect.unreachable();
    expect(result.error.code).toBe("CONFLICT");
    expect(result.error.message).toContain("another Vercel project");
    expectNoTokenLeak(result);
  });

  it("passes a 403 provider message through without the token", async () => {
    const { fetchImpl } = fakeFetch([
      {
        status: 403,
        body: { error: { message: "You don't have access to the domain you are adding." } },
      },
    ]);
    const result = await addProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return expect.unreachable();
    expect(result.error.message).toContain("don't have access");
    expectNoTokenLeak(result);
  });

  it("reports a network failure as retryable, not as a provider refusal", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("socket hang up");
    };
    const result = await addProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return expect.unreachable();
    expect(result.error.message).toContain("Could not reach Vercel");
    expectNoTokenLeak(result);
  });

  it("refuses to run without configuration and never calls the network", async () => {
    const { fetchImpl, calls } = fakeFetch([]);
    const result = await addProjectDomain("shop.example.com", { config: null, fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return expect.unreachable();
    expect(result.error.message).toContain("not configured");
    expect(calls).toEqual([]);
  });
});

describe("removeProjectDomain", () => {
  it("accepts 200 as detached", async () => {
    const { fetchImpl, calls } = fakeFetch([{ status: 200, body: null }]);
    const result = await removeProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result).toEqual({ ok: true, data: { detached: true } });
    expect(calls[0]?.url).toBe(
      "https://api.vercel.com/v9/projects/prj_test_123/domains/shop.example.com"
    );
    expect(calls[0]?.method).toBe("DELETE");
  });

  it("accepts 404 as already detached — the goal state is 'gone'", async () => {
    const { fetchImpl } = fakeFetch([{ status: 404, body: { error: { message: "Not found" } } }]);
    const result = await removeProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result).toEqual({ ok: true, data: { detached: true } });
  });

  it("surfaces other failures", async () => {
    const { fetchImpl } = fakeFetch([{ status: 500, body: { error: { message: "Boom" } } }]);
    const result = await removeProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return expect.unreachable();
    expect(result.error.message).toBe("Boom");
    expectNoTokenLeak(result);
  });
});

describe("getProjectDomain", () => {
  it("finds the domain in the list and maps the verified flag", async () => {
    const { fetchImpl } = fakeFetch([
      {
        status: 200,
        body: {
          domains: [
            { name: "other.example.com", verified: true },
            { name: "shop.example.com", verified: false },
          ],
        },
      },
    ]);
    const result = await getProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result).toEqual({ ok: true, data: { name: "shop.example.com", verified: false } });
  });

  it("returns null when the project does not hold the domain", async () => {
    const { fetchImpl } = fakeFetch([
      { status: 200, body: { domains: [{ name: "other.example.com", verified: true }] } },
    ]);
    const result = await getProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result).toEqual({ ok: true, data: null });
  });

  it("fails on a non-200 answer", async () => {
    const { fetchImpl } = fakeFetch([{ status: 403, body: { error: { message: "Denied" } } }]);
    const result = await getProjectDomain("shop.example.com", { config: CONFIG, fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return expect.unreachable();
    expect(result.error.message).toBe("Denied");
    expectNoTokenLeak(result);
  });
});
