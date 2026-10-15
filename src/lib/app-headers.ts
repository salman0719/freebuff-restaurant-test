/**
 * Baseline security headers (Phase 6.1). Pure data — no Next import, so the
 * values are unit-tested here while `next.config.ts` does nothing but wire
 * them onto every response.
 *
 * The 6.1 review found the app sent none of these: a restaurant platform
 * takes owner sign-in on a public hostname, so the cheap, standard
 * protections belong on every response rather than on none.
 *
 * Deliberately NOT here: `Content-Security-Policy`. Next ships inline
 * bootstrap scripts, so a correct page CSP needs a nonce pipeline threaded
 * through rendering — a change with real breakage risk that belongs in its
 * own piece of work, not a header added while hardening. The one place bytes
 * a user uploaded are served from our origin (the image route) sets its own
 * locking-down CSP, because that response is data, not a document.
 */
export interface AppHeader {
  key: string;
  value: string;
}

export const APP_SECURITY_HEADERS: AppHeader[] = [
  // Force HTTPS for two years, subdomains included. Browsers ignore HSTS
  // received over plain HTTP, so `*.localhost` development is unaffected —
  // and this is exactly the header that stops a downgrade to http://.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Never let a browser re-interpret a response as another type. Matters
  // most for the uploaded files served from our own origin.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The platform is never framed: no embed feature exists, and this is the
  // cheap defence against clickjacking an owner's dashboard controls.
  { key: "X-Frame-Options", value: "DENY" },
  // Tenant URLs carry slugs, and dashboard URLs can name an unpublished
  // restaurant: keep them out of other origins' logs.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];
