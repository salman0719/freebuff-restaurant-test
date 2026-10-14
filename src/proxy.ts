/**
 * Edge route gate (Phase 1.3). Next 16's `middleware.ts` successor.
 *
 * **Location is load-bearing.** Next only loads this file from the project
 * root *or* from `src`, whichever is the app directory's own level — and this
 * app is `src/app`, so it has to be `src/proxy.ts`. It lived at the
 * repository root until Phase 4.1, where Next silently never loaded it: the
 * gate documented here had never run once, and nothing failed to say so.
 * The symptom was subtle by design — the page-level check still guarded the
 * routes, so an anonymous request was merely *streamed* a redirect inside a
 * 200 shell instead of being bounced with a real 302 before any rendering.
 *
 * First-pass check only: it keeps anonymous visitors out of the owner and
 * operator surfaces before routes render. Every protected operation
 * re-checks with `requireUser` / `requireOperator` / `requireTenantMember`
 * near the data (`src/lib/permissions.ts`, `src/lib/operator-access.ts`) —
 * this gate is never the only check, and Next's own guidance is that Proxy
 * is for optimistic checks, not authorisation.
 *
 * Unauthenticated hits redirect to `/login` (owned by the dashboard phase,
 * `src/app/login`), preserving the wanted path in `?next=`. Tenant
 * resolution itself stays in the data layer (see 0003). Proxy runs on the
 * Node.js runtime in Next 16, so the session lookup here can reach the
 * database.
 *
 * The redirect target is built from the configured auth origin, not from
 * request input, so a forged `Host` header cannot send a visitor to an
 * attacker's copy of the sign-in page (verified against a production
 * server: `Host: evil.example` still answered with the platform origin).
 * Keep it that way — deriving this from the request would be an open
 * redirect, and this platform deliberately accepts hostnames as data.
 */
import { auth } from "@/auth";

export const proxy = auth((req) => {
  if (!req.auth) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", req.nextUrl.pathname);
    return Response.redirect(url);
  }
});

export const config = {
  // `:path*` matches zero or more segments, so each entry covers both the
  // section root (`/dashboard`) and everything under it (`/dashboard/x`) —
  // verified against the running app, not assumed. The public site is
  // deliberately absent: it stays open to anonymous visitors.
  matcher: ["/dashboard/:path*", "/operator/:path*"],
};
