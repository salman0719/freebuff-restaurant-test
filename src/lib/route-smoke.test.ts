import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDGE_STATUSES,
  EDGE_REDIRECT_STATUS,
  SIGN_IN_PATH,
  SMOKE_ROUTES,
  checkProtected,
  checkPublic,
  evaluateRoute,
  type SmokeRoute,
} from "./route-smoke";

const protectedRoute: SmokeRoute = {
  path: "/dashboard",
  kind: "protected",
  reason: "test",
};

const publicRoute: SmokeRoute = { path: SIGN_IN_PATH, kind: "public", reason: "test" };

describe("SMOKE_ROUTES", () => {
  it("covers both kinds, so neither half of the gate can go unmeasured", () => {
    expect(SMOKE_ROUTES.some((route) => route.kind === "protected")).toBe(true);
    expect(SMOKE_ROUTES.some((route) => route.kind === "public")).toBe(true);
  });

  it("keeps every protected path a plain pathname", () => {
    // The gate copies `nextUrl.pathname` into `?next=`, so a query string in a
    // protected path would make the `next=` comparison silently wrong.
    for (const route of SMOKE_ROUTES.filter((item) => item.kind === "protected")) {
      expect(route.path).not.toContain("?");
      expect(route.path.startsWith("/")).toBe(true);
    }
  });

  it("always checks the sign-in page itself", () => {
    expect(SMOKE_ROUTES.some((route) => route.path === SIGN_IN_PATH)).toBe(true);
  });

  it("marks exactly the host-dependent content routes", () => {
    expect(SMOKE_ROUTES.filter((route) => route.hostDependent).map((route) => route.path)).toEqual([
      "/",
    ]);
  });

  it("has no duplicate paths", () => {
    const paths = SMOKE_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("checkProtected", () => {
  it("passes when the edge gate bounces the request with its own redirect", () => {
    const verdict = checkProtected(protectedRoute, {
      status: EDGE_REDIRECT_STATUS,
      location: `${SIGN_IN_PATH}?next=%2Fdashboard`,
    });
    expect(verdict).toEqual({ ok: true, note: "302 → /login?next=/dashboard" });
  });

  it("fails a 200 as the streamed-redirect signature", () => {
    const verdict = checkProtected(protectedRoute, { status: 200, location: null });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/edge gate did not run/);
    expect(verdict.reason).toMatch(/streamed/);
  });

  it("fails a page-level 307 and names the cause", () => {
    const verdict = checkProtected(protectedRoute, {
      status: 307,
      location: `${SIGN_IN_PATH}?next=%2Fdashboard`,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/answered 307/);
    expect(verdict.reason).toMatch(/page-level/);
  });

  it("fails a redirect that does not land on the sign-in page", () => {
    const verdict = checkProtected(protectedRoute, {
      status: EDGE_REDIRECT_STATUS,
      location: "/somewhere-else?next=/dashboard",
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/must land on \/login/);
  });

  it("fails a redirect that drops the wanted path", () => {
    const verdict = checkProtected(protectedRoute, {
      status: EDGE_REDIRECT_STATUS,
      location: SIGN_IN_PATH,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/no `next` parameter/);
  });

  it("fails a redirect that rewrites the wanted path", () => {
    const verdict = checkProtected(protectedRoute, {
      status: EDGE_REDIRECT_STATUS,
      location: `${SIGN_IN_PATH}?next=%2Foperator`,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/next=\/operator/);
  });

  it("fails a redirect with no Location header", () => {
    const verdict = checkProtected(protectedRoute, {
      status: EDGE_REDIRECT_STATUS,
      location: null,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/no Location header/);
  });

  it("reports an unparsable Location instead of throwing", () => {
    const verdict = checkProtected(protectedRoute, {
      status: EDGE_REDIRECT_STATUS,
      location: "http://[",
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/unparsable/);
  });

  it("fails a not-found answer, which means the request was not bounced", () => {
    const verdict = checkProtected(protectedRoute, { status: 404, location: null });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/answered 404/);
  });

  it("honours a widened set of accepted gate statuses", () => {
    const observation = { status: 307, location: `${SIGN_IN_PATH}?next=%2Fdashboard` };
    expect(checkProtected(protectedRoute, observation).ok).toBe(false);
    expect(checkProtected(protectedRoute, observation, [302, 307]).ok).toBe(true);
    expect(DEFAULT_EDGE_STATUSES).toEqual([EDGE_REDIRECT_STATUS]);
  });
});

describe("checkPublic", () => {
  it("passes a 200", () => {
    expect(checkPublic(publicRoute, { status: 200, location: null })).toEqual({
      ok: true,
      note: "200",
    });
  });

  it("fails any redirect, so an over-broad gate cannot hide here either", () => {
    const verdict = checkPublic(publicRoute, {
      status: EDGE_REDIRECT_STATUS,
      location: `${SIGN_IN_PATH}?next=%2Flogin`,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/stay open to anonymous visitors/);
  });

  it("fails an authentication status", () => {
    for (const status of [401, 403]) {
      const verdict = checkPublic(publicRoute, { status, location: null });
      expect(verdict.ok).toBe(false);
    }
  });

  it("tolerates a 404 only on a host-dependent route", () => {
    const contentRoute: SmokeRoute = { ...publicRoute, hostDependent: true };
    const tolerated = checkPublic(contentRoute, { status: 404, location: null });
    expect(tolerated.ok).toBe(true);
    expect(checkPublic(publicRoute, { status: 404, location: null }).ok).toBe(false);
  });

  it("still fails a server error on a host-dependent route", () => {
    const contentRoute: SmokeRoute = { ...publicRoute, hostDependent: true };
    const verdict = checkPublic(contentRoute, { status: 500, location: null });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/answered 500/);
  });
});

describe("evaluateRoute", () => {
  it("dispatches on the route kind", () => {
    expect(evaluateRoute(publicRoute, { status: 200, location: null }).ok).toBe(true);
    expect(evaluateRoute(protectedRoute, { status: 200, location: null }).ok).toBe(false);
  });

  it("forwards widened gate statuses to the protected rule only", () => {
    const observation = { status: 307, location: `${SIGN_IN_PATH}?next=%2Fdashboard` };
    expect(evaluateRoute(protectedRoute, observation, [302, 307]).ok).toBe(true);
    expect(evaluateRoute(publicRoute, observation, [302, 307]).ok).toBe(false);
  });
});
