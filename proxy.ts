/**
 * Edge route gate (Phase 1.3).
 *
 * Next 16's `middleware.ts` successor. First-pass check only: it keeps
 * anonymous visitors out of the owner/operator surfaces (built in Phases
 * 3–4) before routes render. Every protected operation re-checks with
 * `requireUser` / `requireOperator` / `requireTenantMember` near the data
 * (`src/lib/permissions.ts`) — this gate is never the only check.
 *
 * Unauthenticated hits redirect to `/login`, which the dashboard phase
 * owns; until then the redirect target 404s safely without leaking tenant
 * content. Tenant resolution itself stays in the data layer (see 0003).
 */
import { auth } from "@/auth";

export const proxy = auth((req) => {
  if (!req.auth) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("next", req.nextUrl.pathname);
    return Response.redirect(login);
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/operator/:path*"],
};
