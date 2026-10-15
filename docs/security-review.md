# Security review (Phase 6.1)

**Date:** 2026-10-15 · **Branch:** `phase6` (from `phase5`) · **Scope:**
the MVP as it ships — public sites, owner dashboard, operator console,
uploads, custom domains.

The roadmap asks for four things: review the boundaries, test unauthorised
access by changing resource IDs, check secrets and environment
configuration, review dependency warnings, and fix critical/high issues
before onboarding customers. This is the resulting checklist.

**Method matters as much as the verdicts here.** Where a claim could be
measured, it wasmeasured rather than assumed: the input bound and the parser cost were
probed directly (scratch scripts `local/security-probe.ts` and
`local/security-probe2.ts` — git-ignored, as `local/` is, so they are not
reproducible from a clone; the bound they established is pinned as a
committed test instead), the redirect and header behaviour was read off a
real production server (`next start`), and each new test was
mutation-checked to prove it fails when the protection is removed.
Anything not verified says so below.

## Checklist

| #   | Area                                   | What was checked                                                                                                                                                                                                                                                                                                          | Verdict                                                                                                                |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Authentication                         | Magic links only (no passwords, per 0.2); sessions DB-backed through the Drizzle adapter; `session` callback copies `id` and `role` from the stored user row, never from request data; no `NEXT_PUBLIC_*` anywhere; provider config from env                                                                              | No findings. Set `AUTH_URL` in production (see F6).                                                                    |
| 2   | Role checks & privilege escalation     | `users.role` is the only authority, loaded from the database by the adapter; the operator gate is one module, with a structural test requiring every file under `src/app/operator` to call it and a tripwire failing if any module writes `users.role`; action paths use the structured `requireOperator` and fail closed | No findings. Session role claims cannot substitute for a membership row — now pinned by a live test.                   |
| 3   | Tenant isolation & resource-ID forgery | Every child read/write goes through a context-scoped loader; no function outside provisioning accepts a caller-supplied tenant id; every mutation proves ownership before writing                                                                                                                                         | No findings. New suite pins no-oracle, no-partial-write, and composed-forgery properties (see below).                  |
| 4   | Public data exposure                   | Published-only view; unknown, unpublished and malformed slugs all `NOT_FOUND`; no owner/user/config data leaves the public module; theme options are strict per-theme enums mapped to static class tables, so no tenant string reaches a `className`; no `dangerouslySetInnerHTML`, `eval`, or `new Function` in `src/`   | No findings.                                                                                                           |
| 5   | Uploads                                | Magic-byte sniff must match the declared MIME, 2 MB cap, extension taken from the sniffed bytes (never the filename), server-generated random keys, strict key allowlist plus contained resolve, replaced files deleted                                                                                                   | Hardened: the serving route now sends `nosniff` and a locking-down CSP (F2). Accepted by design: capability URLs (F9). |
| 6   | Domain verification                    | DNS TXT token proves ownership; the resolver honours a `custom_domain` row only when `verified`; the unique index refuses a takeover; removal clears domain, state and token together; routing fails closed without `VERCEL_*`                                                                                            | No findings (5.2–5.4 suites).                                                                                          |
| 7   | Secrets & environment configuration    | No `.env*` file is tracked (only `.env.example`, placeholders); `VERCEL_TOKEN` is read server-side only and never appears in a message (asserted in 5.3 tests); all SQL is parameterised — no `sql.raw`, no `db.execute`, no interpolated queries                                                                         | Fixed: the app previously sent no security headers at all (F8).                                                        |
| 8   | Dependency warnings                    | `npm audit`: 13 advisories (9 high, 4 moderate, 0 critical), split into production-reachable and dev-only; per-advisory reachability assessed against our usage                                                                                                                                                           | No reachable advisory found; upgrade path recorded (F4, F5).                                                           |
| 9   | Abuse controls                         | Searched for rate limiting on the unauthenticated magic-link request: none exists                                                                                                                                                                                                                                         | **Open — needs a decision (F3). Highest-impact item found.**                                                           |

## Issues and resolutions

| ID  | Severity   | Issue                                                                                                                                                                                                                       | Resolution                                                                                                                                                                                                 |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Low        | `emailSchema` had no length bound and accepted a 200,013-character address on the unauthenticated login form                                                                                                                | **Fixed** (`837c867`): bounded at 254 (RFC 5321 maximum). Boundary tests on both sides.                                                                                                                    |
| F2  | Low        | The route serving tenant-uploaded bytes sent no security headers                                                                                                                                                            | **Fixed** (`665ed67`): `X-Content-Type-Options: nosniff` + `Content-Security-Policy: default-src 'none'; sandbox`. The route had no test at all; it now has three, covering refusals as well as promises.  |
| F3  | **Medium** | **No rate limiting or abuse control on the magic-link endpoint.** Anyone can make the platform send unlimited sign-in emails to arbitrary addresses, and write unlimited `verification_tokens` rows, with no authentication | **Open — needs an infrastructure decision.** See "Open item F3" below.                                                                                                                                     |
| F4  | Low        | Dev-only advisories (`eslint-config-next` → `braces`/`micromatch`/`fast-glob`; `drizzle-kit` → `esbuild`)                                                                                                                   | **Accepted.** Build- and migration-time only; neither ships in the production bundle. `npm audit fix --force` would downgrade `eslint-config-next` to a v14 major, which is not a real fix.                |
| F5  | Low        | 12 advisories on `nodemailer@7.0.12`, which **is** the copy Auth.js sends with (single deduped install)                                                                                                                     | **Accepted with an upgrade trigger.** No advisory is reachable through a surface this app exposes (analysis below). The fix version is blocked by `@auth/core`'s peer range — revisit at pilot onboarding. |
| F6  | Info       | Could a forged `Host` header steer the auth redirect (open redirect)?                                                                                                                                                       | **Verified safe, no change needed.** Tested against a production server, two configurations, eight variants. The proxy comment's claim now has evidence.                                                   |
| F7  | Low        | `assignMembershipSchema.userId` has no length bound — and no production caller at all                                                                                                                                       | **Open (low).** Dead schema; if it is ever adopted, bound it the way `emailSchema` now is.                                                                                                                 |
| F8  | Low        | The app sent no baseline security headers (no HSTS, no framing protection, no referrer policy)                                                                                                                              | **Fixed** (`2cc7e55`): four headers on every response, values in a unit-tested pure module, verified against a production server.                                                                          |
| F9  | Info       | Uploads are capability URLs: anyone holding a key can fetch the object, including an unpublished restaurant's logo, and the response caches immutably for a year                                                            | **Accepted by design.** Keys are random UUIDs generated server-side, learnable only from a tenant's own pages. Revisit if images ever become private (signed URLs / R2 prefix policy).                     |

### Open item F3 — abuse control on sign-in

This is the one finding I could not resolve inside this review, and the
highest-impact one, so it is stated plainly rather than buried.

What exists today: `requestMagicLink` validates the address and calls
`signIn("nodemailer", …)` unconditionally. There is no rate limit, no
captcha, and no per-address or per-IP throttle anywhere in `src/` (searched
for `rate.?limit|throttle|too many|429`).

Impact: an unauthenticated caller can (a) make the platform send mail to
arbitrary addresses — SMTP quota, deliverability and domain-reputation
damage, and the platform looks like a spam source; (b) write one
`verification_tokens` row per request; (c) spend CPU and database work per
request. Existing mitigations are partial only: tokens are single-use and
expire, and the address is now length-bounded (F1).

Why it is not fixed here: a correct limiter needs a durable store. An
in-process counter is close to useless on serverless (each invocation may be
a fresh isolate), and the project's standing rule is not to add a dependency
or service without asking. The recommended resolution is therefore
infrastructure rather than code: a rate-limit rule at the edge (for
example, a hosting-provider WAF rule) keyed on IP and path, with an
application-level limiter backed by a store only if that proves
insufficient. **This needs your decision, and it belongs on the pilot
checklist before real customers are onboarded.**

### F5 — the nodemailer advisory set, assessed against our usage

`npm ls nodemailer` shows one deduped `nodemailer@7.0.12` under both
`next-auth` and `@auth/drizzle-adapter`, so the vulnerable copy is genuinely
the one that sends our magic links — the question is reachability:

- **Quadratic parser / stack-exhaustion DoS** (GHSA-2x7j-588g-ccc2,
  GHSA-v53p-9fqp-m79j, GHSA-8vvx-rff5-p5rq): the trigger shapes are
  comma-separated recipient lists, quoted local parts, display-name/angle
  forms, parentheses and nested arrays. Every one of them is **rejected by
  `emailSchema`** before the provider is reached, and `to` is always a
  single string. Measured for the shapes that do pass: doubling the input
  doubles the time (linear), not quadruples.
- **File-read / SSRF via `raw` or legacy `resolveContent`**
  (GHSA-p6gq-j5cr-w38f, GHSA-8m3c-c648-2xjj): require attacker-controlled
  message options. We send a fixed template; only the recipient address
  comes from input.
- **CRLF injection in the transport name or `List-*` headers**
  (GHSA-vvjj-xcjg-gr5g, GHSA-268h-hp4c-crq3): the transport comes from
  `EMAIL_SERVER` (operator configuration) and the headers are fixed.
- **OAuth2 token-fetch TLS validation** (GHSA-r7g4-qg5f-qqm2): we use plain
  SMTP, not OAuth2.
- **Recipient-domain parse bypasses** (GHSA-wmmp-3585-3rmp,
  GHSA-cc9r-2j5m-2m83): would deliver to a different domain than typed; the
  recipient is the person making the request, so no third party is exposed.
- **Cross-tenant SMTP credential disclosure via a process-global DNS cache**
  (GHSA-6vj9-mwq6-2f5v): needs several transports with different credentials
  in one process. The platform has exactly one, from the environment. This is
  a **constraint to respect**: do not add per-tenant SMTP transports while
  this version is installed.

Why the fix cannot simply be applied: `@auth/core@0.41.3` declares
`nodemailer: ^7.0.7 || ^8.0.5` as a peer range. Climbing to 8.0.8 would be
allowed — but it only clears advisories that are already unreachable here,
while the reachability-relevant families are fixed only outside the range
entirely (≥9.1.0 for the parser ones, ≥10.0.2 for stack exhaustion and the
DNS-cache one). Installing anything past the declared range breaks the peer
contract of the module that sends our mail, so this becomes a deliberate
upgrade once `@auth/core` widens it. **Trigger: re-run `npm audit` at pilot
onboarding and check that peer range before then.**

`npm audit fix --force` must not be run for this: it proposes
`next-auth@1.12.1`, a major downgrade away from the v5 beta the whole auth
foundation is built on.

## What the new tests prove

6.1 asked for unauthorised access by changing resource IDs to be **tested**,
so that is a suite rather than an assertion:
`src/lib/resource-id-forgery-live.test.ts` (live, opt-in like its siblings)
pins three properties that a refusal returning an error could still violate:

1. **No enumeration oracle** — a foreign id, a never-existed id, and a
   malformed id produce the same code, message and shape at every entry
   point (reads, category mutations, item mutations, both photo paths, and
   the category-filtered item read).
2. **A refused write changes nothing** — after every cross-tenant attempt,
   the victim's row, counts, and stored photo file are compared before and
   after and must be identical, including that a refused upload leaves no
   orphan file on disk.
3. **A claimed role is not a membership** — a session asserting the
   platform-staff role for a restaurant it is not a member of gets the same
   `FORBIDDEN` as a nonexistent one.

Mutation-checked, so the suite is worth its green: making `ownsRow`
permissive fails three of the four tests, and turning a missing row into
`NOT_FOUND` fails exactly the no-oracle test — the property no other suite
covered before.

## Verification log (2026-10-15)

| Check                                         | Result                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npx vitest run` with `TEST_DATABASE_URL`     | **593 passed / 49 files** (was 581 before this round)                                        |
| `npx vitest run` without a database           | **547 passed, 46 skipped** — the live suites opt out rather than silently passing            |
| `npm run check`                               | green (lint, strict typecheck, format)                                                       |
| `npm run build`                               | green                                                                                        |
| `npx playwright test`                         | **15/15 passed** (headers are app-wide, so the whole journey suite was re-run, not one spec) |
| Production server, headers                    | 200 HTML, gate 302, 404, and a served upload all carry the baseline set                      |
| Production server, forged `Host` (8 variants) | redirect pinned to the configured origin, or relative — never the forged host                |
| `npm audit`                                   | 13 advisories, triaged; none reachable (F4, F5)                                              |

## Before onboarding a pilot customer

- [ ] Decide and implement F3 (edge rate limiting on sign-in).
- [ ] Set `AUTH_URL` in the deployed environment so redirects, callbacks and
      `__Secure-` cookies are deterministic over HTTPS; keep `AUTH_TRUST_HOST`
      only where the host cannot be forged.
- [ ] Re-run `npm audit`; re-check the `@auth/core` peer range for a
      `nodemailer` upgrade (F5) and revisit the dev-only advisories (F4).
- [ ] Decide the uploading/storage move (F9): the local filesystem driver is
      dev-only and `local/uploads` never deploys — R2 (0002 §5) is the
      planned swap, and it is a precondition for real customers' images.
- [ ] Bound `assignMembershipSchema.userId` if anything starts using it (F7).
- [ ] Plan the page CSP with nonces as its own change (F8 note).

## Related

- `docs/decisions/0003-tenant-identification.md` — the tenant model this
  review's isolation checks follow.
- `docs/runbooks/domain-lifecycle.md` — the address-lifecycle guarantees
  re-checked under item 6.
- `docs/audit.md` — the Phase 0.1 repository audit this round's method
  mirrors (verify by running, not by reading).
