/**
 * Thin Vercel REST client for project-domain management (Phase 5.3).
 * Server-only: holds the API token, which must never leave this module.
 *
 * Scoped to ONE project — `VERCEL_PROJECT_ID` — because the token is
 * project-scoped: every operation addresses `{projectId}/domains`, never
 * account- or team-level resources. Domain strings reaching these
 * functions have already been validated by the claim flow and scoped to
 * the context tenant; nothing here accepts a project id from a caller.
 *
 * Contract facts (verified against the REST docs, sources below):
 * - `POST /v10/projects/{id}/domains` answers 200 on success, **400 when
 *   the domain is already on THIS project** (not idempotent, not 409),
 *   409 when it belongs to another project/account, 403 when the token
 *   cannot access it.
 * - `DELETE /v9/projects/{id}/domains/{domain}` answers 200; 404 means
 *   already detached — both are success for a caller that wants the
 *   domain gone.
 * - The list carries `verified` per domain (Vercel validated it for the
 *   project) but **no certificate status** — HTTPS reality is what the
 *   probe in `./domain-routing.ts` measures, which is why "live" there
 *   requires the probe AND this `verified` flag.
 * - No `teamId` query param: a project-scoped token implies both.
 * - Docs: https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project,
 *   .../remove-a-domain-from-a-project,
 *   .../retrieve-project-domains-by-project-by-id-or-name
 *
 * Fetch is injectable so every path (400-already, 409-conflict, network
 * failure, missing config) is unit-tested without the network — and
 * without anyone's real project.
 */
import { err, ok, type ServiceResult } from "./result";

/** What Vercel reports about one project domain. */
export interface VercelDomainView {
  name: string;
  verified: boolean;
}

/** The seam tests inject; `fetch` matches it structurally. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const API = "https://api.vercel.com";
const TIMEOUT_MS = 10_000;

export interface VercelConfig {
  token: string;
  projectId: string;
}

/** Read config from the environment; null when routing is not set up. */
export function vercelConfig(): VercelConfig | null {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return { token, projectId };
}

function notConfigured<T>(): ServiceResult<T> {
  return err(
    "INTERNAL",
    "Custom-domain routing is not configured on this deployment (VERCEL_TOKEN / VERCEL_PROJECT_ID missing)."
  );
}

/**
 * `undefined` means "read the environment"; an explicit `null` means
 * "treat as unconfigured" (the seam tests rely on that distinction —
 * `??` would silently fall through to the real environment).
 */
function resolveConfig(deps: { config?: VercelConfig | null }): VercelConfig | null {
  return deps.config !== undefined ? deps.config : vercelConfig();
}

function providerMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      // Vercel's domain errors are operator-facing sentences ("The
      // domain is already assigned to another Vercel project") — safe
      // and more honest than a generic fallback. Never the token.
      if (typeof message === "string" && message) return message;
    }
  }
  return fallback;
}

async function call(
  config: VercelConfig,
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike
): Promise<{ status: number; body: unknown }> {
  const response = await fetchImpl(`${API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Some answers (notably DELETE) carry no JSON body.
    body = null;
  }
  return { status: response.status, body };
}

function toView(raw: unknown): VercelDomainView | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { name?: unknown; verified?: unknown };
  if (typeof record.name !== "string") return null;
  return { name: record.name, verified: record.verified === true };
}

/**
 * Attach `domain` to the project. Already-attached (400) is confirmed
 * through the list and reported as success — a retried attach must not
 * read as failure. A 409 is the documented "another project owns it"
 * conflict and surfaces as `CONFLICT`.
 */
export async function addProjectDomain(
  domain: string,
  deps: { config?: VercelConfig | null; fetchImpl?: FetchLike } = {}
): Promise<ServiceResult<VercelDomainView & { alreadyAttached: boolean }>> {
  const config = resolveConfig(deps);
  if (!config) return notConfigured();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = `/v10/projects/${config.projectId}/domains`;
  let result: Awaited<ReturnType<typeof call>>;
  try {
    result = await call(
      config,
      base,
      { method: "POST", body: JSON.stringify({ name: domain }) },
      fetchImpl
    );
  } catch {
    return err("INTERNAL", "Could not reach Vercel to connect the domain. Try again shortly.");
  }
  if (result.status === 200) {
    const view = toView(result.body);
    if (!view) return err("INTERNAL", "Vercel answered with an unexpected shape.");
    return ok({ ...view, alreadyAttached: false });
  }
  if (result.status === 400) {
    // Already on this project: confirm through the list so the answer
    // is grounded, not assumed.
    const existing = await getProjectDomain(domain, { config, fetchImpl });
    if (existing.ok && existing.data) {
      return ok({ ...existing.data, alreadyAttached: true });
    }
    return err("INTERNAL", providerMessage(result.body, "Vercel refused the domain."));
  }
  if (result.status === 409) {
    return err(
      "CONFLICT",
      providerMessage(result.body, "That domain is already assigned to another Vercel project.")
    );
  }
  return err("INTERNAL", providerMessage(result.body, "Vercel could not attach the domain."));
}

/**
 * Detach `domain` from the project. 200 and 404 both mean the domain is
 * not attached afterwards — the caller's goal is "gone", and a retry
 * after a lost response must not fail on "already gone".
 */
export async function removeProjectDomain(
  domain: string,
  deps: { config?: VercelConfig | null; fetchImpl?: FetchLike } = {}
): Promise<ServiceResult<{ detached: boolean }>> {
  const config = resolveConfig(deps);
  if (!config) return notConfigured();
  const fetchImpl = deps.fetchImpl ?? fetch;
  let result: Awaited<ReturnType<typeof call>>;
  try {
    result = await call(
      config,
      `/v9/projects/${config.projectId}/domains/${encodeURIComponent(domain)}`,
      { method: "DELETE" },
      fetchImpl
    );
  } catch {
    return err("INTERNAL", "Could not reach Vercel to detach the domain. Try again shortly.");
  }
  if (result.status === 200 || result.status === 404) {
    return ok({ detached: true });
  }
  return err("INTERNAL", providerMessage(result.body, "Vercel could not detach the domain."));
}

/** Read one domain's project state; null when the project does not hold it. */
export async function getProjectDomain(
  domain: string,
  deps: { config?: VercelConfig | null; fetchImpl?: FetchLike } = {}
): Promise<ServiceResult<VercelDomainView | null>> {
  const config = resolveConfig(deps);
  if (!config) return notConfigured();
  const fetchImpl = deps.fetchImpl ?? fetch;
  let result: Awaited<ReturnType<typeof call>>;
  try {
    result = await call(
      config,
      `/v9/projects/${config.projectId}/domains?limit=100`,
      { method: "GET" },
      fetchImpl
    );
  } catch {
    return err("INTERNAL", "Could not reach Vercel to read the domain state. Try again shortly.");
  }
  if (result.status !== 200) {
    return err(
      "INTERNAL",
      providerMessage(result.body, "Vercel could not list the project domains.")
    );
  }
  const domains = (result.body as { domains?: unknown } | null)?.domains;
  if (!Array.isArray(domains)) {
    return err("INTERNAL", "Vercel answered with an unexpected shape.");
  }
  const found = domains.map(toView).find((view) => view?.name === domain) ?? null;
  return ok(found);
}
