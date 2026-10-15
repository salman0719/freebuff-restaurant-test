/**
 * Custom-domain routing status (Phase 5.3). Server-only.
 *
 * 5.2 proves a domain belongs to a restaurant (TXT token). 5.3 is the
 * part that makes it usable: Vercel routes traffic for a domain once it
 * is attached to the project AND validated, and issues HTTPS
 * automatically — but the API exposes NO certificate status, so the only
 * honest answer to "is it live?" combines three facts:
 *
 * 1. the domain is ATTACHED to the project (`./vercel.ts`),
 * 2. Vercel reports it VERIFIED (DNS validated for this project),
 * 3. an HTTPS probe of the hostname actually completes (TLS + HTTP).
 *
 * `resolveRouting` is the pure fold of those three facts into one state
 * plus a message in plain words, so the mapping is unit-tested and the
 * dashboard can never say "live" before all three hold — the exact line
 * 4.3 draws ("a domain must not be called live before routing and TLS
 * do") is now enforced in one place.
 *
 * Attach/detach are driven by the claim flow: verifying a claim connects
 * routing; removing a claim disconnects it. Both are best-effort at the
 * edges — a failed attach never un-verifies a (durable) claim, and a
 * failed detach never blocks removal, because the hostname resolver
 * (the actual security boundary) stops honoring the domain the moment
 * the claim is gone.
 */
import { ok, type ServiceResult } from "./result";
import {
  getProjectDomain,
  removeProjectDomain,
  addProjectDomain,
  type FetchLike,
  type VercelConfig,
} from "./vercel";

/** Did an HTTPS request to the hostname complete at all? */
export type ProbeResult = "online" | "offline";

/** One of the three provider-exposed facts behind "live". */
export interface RoutingFacts {
  attached: boolean;
  vercelVerified: boolean;
  probe: ProbeResult | null;
}

export interface RoutingStatus {
  status: "detached" | "pending" | "live";
  message: string;
}

/**
 * Fold the facts into a state. Pure — the whole truth table is in
 * `domain-routing.test.ts`, and "live" is unreachable unless every fact
 * holds, so no combination of half-true provider answers can produce it.
 */
export function resolveRouting(facts: RoutingFacts): RoutingStatus {
  if (!facts.attached) {
    return {
      status: "detached",
      message:
        "Not connected to the platform edge yet. Re-checking after verification connects it automatically.",
    };
  }
  if (!facts.vercelVerified) {
    return {
      status: "pending",
      message:
        "Connected, but the platform has not validated the domain's DNS yet — this clears within minutes of DNS pointing here.",
    };
  }
  if (facts.probe !== "online") {
    return {
      status: "pending",
      message:
        "DNS is validated; HTTPS is still coming online. Certificates usually issue within a few minutes — keep checking.",
    };
  }
  return {
    status: "live",
    message: "Live — the domain answers over HTTPS and serves this restaurant.",
  };
}

const PROBE_TIMEOUT_MS = 10_000;

/**
 * Probe `https://<domain>/`: any completed HTTP exchange — whatever the
 * status code — proves TLS worked and the request reached a server.
 * Combined with `verified` (Vercel validated this domain for OUR
 * project), that server is our app, so `resolveRouting` can say "live".
 * A DNS failure, refused connection, or bad certificate all land in the
 * same honest bucket: `offline`.
 */
export async function probeHttps(
  domain: string,
  fetchImpl: FetchLike = fetch
): Promise<ProbeResult> {
  try {
    await fetchImpl(`https://${domain}/`, {
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return "online";
  } catch {
    return "offline";
  }
}

export interface RoutingDeps {
  config?: VercelConfig | null;
  fetchImpl?: FetchLike;
  probe?: (domain: string) => Promise<ProbeResult>;
}

/**
 * Connect routing for a just-verified claim. Attaching an already
 * attached domain is success (`alreadyAttached`), so a retried verify
 * never re-reports failure.
 */
export async function connectRouting(
  domain: string,
  deps: RoutingDeps = {}
): Promise<ServiceResult<{ attached: boolean; vercelVerified: boolean }>> {
  const added = await addProjectDomain(domain, deps);
  if (!added.ok) return added;
  return ok({ attached: true, vercelVerified: added.data.verified });
}

/**
 * Disconnect routing for a removed claim. Best-effort by design: the
 * resolver already stopped honoring the domain when the claim was
 * cleared, so a Vercel failure here is reported, never blocking.
 */
export async function disconnectRouting(
  domain: string,
  deps: RoutingDeps = {}
): Promise<ServiceResult<{ detached: boolean }>> {
  return removeProjectDomain(domain, deps);
}

/** Read the three facts (API + probe in parallel) and fold them. */
export async function getRoutingStatus(
  domain: string,
  deps: RoutingDeps = {}
): Promise<ServiceResult<RoutingStatus>> {
  const existing = await getProjectDomain(domain, deps);
  if (!existing.ok) return existing;
  const probe = deps.probe ?? probeHttps;
  const probeResult = await probe(domain);
  return ok(
    resolveRouting({
      attached: existing.data !== null,
      vercelVerified: existing.data?.verified === true,
      probe: probeResult,
    })
  );
}
