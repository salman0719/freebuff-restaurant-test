/**
 * Route smoke check (Phase 4.1 follow-up) — the pure half.
 *
 * Phase 4.1 found that `proxy.ts` had sat at the repository root since Phase
 * 1.3, where Next silently never loaded it: the edge gate had never run once
 * and nothing failed to say so. The symptom was subtle by design — the
 * page-level check still guarded every route, so an anonymous request was
 * merely *streamed* a redirect inside a 200 shell instead of being bounced
 * with a real 302 before rendering. A build that lists `ƒ Proxy (Middleware)`
 * does not prove a request is bounced either.
 *
 * So the one thing this module asserts is the thing that failed silently: a
 * protected path must answer with the edge gate's own redirect, **not** a
 * 200 and not the 303/307/308 that a page-level `redirect()` produces. The
 * status code is the whole point — the body looks almost right either way.
 *
 * Pure: no `next/*` import, no network, no database. `scripts/smoke.ts` does
 * the HTTP half and prints these verdicts; `route-smoke.test.ts` pins them.
 */

export type RouteKind = "protected" | "public";

export interface SmokeRoute {
  path: string;
  kind: RouteKind;
  /** Why this path is in the list, so a failure reads as a diagnosis. */
  reason: string;
  /**
   * Content route whose status depends on host→tenant resolution rather than
   * on the gate: `/` renders a tenant only where the Host header resolves to
   * one, so a bare 404 is a legitimate "no tenant at this host" answer, not a
   * gate failure. The sign-in page and every protected path are
   * host-independent and stay exact.
   */
  hostDependent?: boolean;
}

export interface HttpObservation {
  status: number;
  /** Raw `Location` header of a redirect, or null when there is none. */
  location: string | null;
}

export type SmokeVerdict = { ok: true; note: string } | { ok: false; reason: string };

/** The sign-in target every redirected anonymous visitor must land on. */
export const SIGN_IN_PATH = "/login";

/**
 * What the edge gate answers with: `Response.redirect` defaults to 302.
 * Pinned deliberately — a page-level `redirect()` from `next/navigation` uses
 * 307, so the exact status is the tell that separates the gate from the
 * page-level fallback that masked its absence.
 */
export const EDGE_REDIRECT_STATUS = 302;

export const DEFAULT_EDGE_STATUSES: readonly number[] = [EDGE_REDIRECT_STATUS];

/**
 * Paths the platform claims are private, and paths it claims stay open.
 * Every protected path is a plain pathname (no query string), because the
 * gate copies `nextUrl.pathname` into `?next=` — `assertRouteList` in the
 * test pins that, so a route added with a query can never make the `next=`
 * comparison quietly wrong.
 */
export const SMOKE_ROUTES: readonly SmokeRoute[] = [
  { path: "/dashboard", kind: "protected", reason: "owner landing" },
  { path: "/dashboard/smoke-tenant", kind: "protected", reason: "tenant dashboard shell" },
  {
    path: "/dashboard/smoke-tenant/profile",
    kind: "protected",
    reason: "tenant editor section (deepest protected shape)",
  },
  { path: "/operator", kind: "protected", reason: "operator console" },
  {
    path: "/operator/tenants/new",
    kind: "protected",
    reason: "operator setup flow (4.2)",
  },
  {
    path: "/operator/tenants/smoke-tenant",
    kind: "protected",
    reason: "operator tenant detail (4.2) — a slug the gate must bounce without resolving",
  },
  { path: SIGN_IN_PATH, kind: "public", reason: "sign-in page — the redirect target" },
  {
    path: `${SIGN_IN_PATH}?next=/dashboard`,
    kind: "public",
    reason: "sign-in carrying a wanted path",
  },
  { path: "/", kind: "public", reason: "public restaurant site", hostDependent: true },
];

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function describeRedirect(observation: HttpObservation): string {
  return observation.location ? ` → ${observation.location}` : " (no Location header)";
}

/**
 * A protected path must be bounced by the edge gate before any rendering.
 * `200` is checked first because that is exactly how the missing proxy hid:
 * a streamed redirect inside a rendered shell.
 */
export function checkProtected(
  route: SmokeRoute,
  observation: HttpObservation,
  edgeStatuses: readonly number[] = DEFAULT_EDGE_STATUSES
): SmokeVerdict {
  if (observation.status === 200) {
    return {
      ok: false,
      reason:
        "answered 200 — the edge gate did not run, so a page-level check streamed the redirect " +
        "inside a rendered shell instead of bouncing the request before rendering. Confirm the " +
        "proxy file sits at the app directory's own level (`src/proxy.ts` for a `src/app` " +
        "project) and that its matcher covers this path.",
    };
  }
  if (!edgeStatuses.includes(observation.status)) {
    return {
      ok: false,
      reason:
        `answered ${observation.status}${describeRedirect(observation)} — expected the edge ` +
        `gate's ${edgeStatuses.join("/")} before any rendering. A 303/307/308 here is a ` +
        "page-level `redirect()`, which means the gate did not fire for this path; any other " +
        "status means the request reached the route instead of being bounced at the edge.",
    };
  }
  const location = observation.location;
  if (!location) {
    return { ok: false, reason: `answered ${observation.status} with no Location header.` };
  }
  let target: URL;
  try {
    target = new URL(location, "http://smoke.invalid");
  } catch {
    return {
      ok: false,
      reason: `answered ${observation.status} with an unparsable Location: ${location}`,
    };
  }
  if (target.pathname !== SIGN_IN_PATH) {
    return {
      ok: false,
      reason: `redirected to ${location} — an anonymous visitor must land on ${SIGN_IN_PATH}.`,
    };
  }
  const next = target.searchParams.get("next");
  if (next !== route.path) {
    const got = next === null ? "no `next` parameter" : `next=${next}`;
    return {
      ok: false,
      reason:
        `redirected to ${location} without preserving the wanted path — expected ` +
        `next=${route.path}, got ${got}.`,
    };
  }
  return { ok: true, note: `${observation.status} → ${SIGN_IN_PATH}?next=${route.path}` };
}

/** A public path must stay open to anonymous visitors, never gated by accident. */
export function checkPublic(route: SmokeRoute, observation: HttpObservation): SmokeVerdict {
  if (isRedirectStatus(observation.status)) {
    return {
      ok: false,
      reason:
        `redirected (${observation.status}${describeRedirect(observation)}) — a public page must ` +
        "stay open to anonymous visitors, so the gate is broader than the platform's private " +
        "routes.",
    };
  }
  if (observation.status === 200) {
    return { ok: true, note: "200" };
  }
  if (route.hostDependent && observation.status === 404) {
    return {
      ok: true,
      note: "404 — no tenant at this host (host-dependent route, not a gate failure)",
    };
  }
  if (observation.status === 401 || observation.status === 403) {
    return {
      ok: false,
      reason: `answered ${observation.status} to an anonymous visitor; expected 200.`,
    };
  }
  return { ok: false, reason: `answered ${observation.status}; expected 200.` };
}

/** Dispatch to the rule for the route's kind. */
export function evaluateRoute(
  route: SmokeRoute,
  observation: HttpObservation,
  edgeStatuses: readonly number[] = DEFAULT_EDGE_STATUSES
): SmokeVerdict {
  return route.kind === "protected"
    ? checkProtected(route, observation, edgeStatuses)
    : checkPublic(route, observation);
}
