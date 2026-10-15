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
| 9   | Abuse controls                         | The unauthenticated magic-link request is the only action with an outbound side effect; it now runs a durable fixed-window limiter on two dimensions _before_ `signIn`, and both the refusal and the absent mail were observed against a real server                                                                      | **Fixed (F3)** — Postgres-backed, no new service. Residual limits stated in F3 below.                                  |

## Issues and resolutions

| ID  | Severity   | Issue                                                                                                                                                                                                                         | Resolution                                                                                                                                                                                                 |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Low        | `emailSchema` had no length bound and accepted a 200,013-character address on the unauthenticated login form                                                                                                                  | **Fixed** (`837c867`): bounded at 254 (RFC 5321 maximum). Boundary tests on both sides.                                                                                                                    |
| F2  | Low        | The route serving tenant-uploaded bytes sent no security headers                                                                                                                                                              | **Fixed** (`665ed67`): `X-Content-Type-Options: nosniff` + `Content-Security-Policy: default-src 'none'; sandbox`. The route had no test at all; it now has three, covering refusals as well as promises.  |
| F3  | **Medium** | **No rate limiting or abuse control on the magic-link endpoint.** Anyone could make the platform send unlimited sign-in emails to arbitrary addresses, and write unlimited `verification_tokens` rows, with no authentication | **Fixed** (`48154f9`, `9dbc36e`, `9c95d91`): durable fixed-window limiter, per address and per source, checked before `signIn` — proven end to end in `96eaa76`. Residual limits stated in F3 below.       |
| F4  | Low        | Dev-only advisories (`eslint-config-next` → `braces`/`micromatch`/`fast-glob`; `drizzle-kit` → `esbuild`)                                                                                                                     | **Accepted.** Build- and migration-time only; neither ships in the production bundle. `npm audit fix --force` would downgrade `eslint-config-next` to a v14 major, which is not a real fix.                |
| F5  | Low        | 12 advisories on `nodemailer@7.0.12`, which **is** the copy Auth.js sends with (single deduped install)                                                                                                                       | **Accepted with an upgrade trigger.** No advisory is reachable through a surface this app exposes (analysis below). The fix version is blocked by `@auth/core`'s peer range — revisit at pilot onboarding. |
| F6  | Info       | Could a forged `Host` header steer the auth redirect (open redirect)?                                                                                                                                                         | **Verified safe, no change needed.** Tested against a production server, two configurations, eight variants. The proxy comment's claim now has evidence.                                                   |
| F7  | Low        | `assignMembershipSchema.userId` has no length bound — and no production caller at all                                                                                                                                         | **Open (low).** Dead schema; if it is ever adopted, bound it the way `emailSchema` now is.                                                                                                                 |
| F8  | Low        | The app sent no baseline security headers (no HSTS, no framing protection, no referrer policy)                                                                                                                                | **Fixed** (`2cc7e55`): four headers on every response, values in a unit-tested pure module, verified against a production server.                                                                          |
| F9  | Info       | Uploads are capability URLs: anyone holding a key can fetch the object, including an unpublished restaurant's logo, and the response caches immutably for a year                                                              | **Accepted by design.** Keys are random UUIDs generated server-side, learnable only from a tenant's own pages. Revisit if images ever become private (signed URLs / R2 prefix policy).                     |

### F3 — abuse control on sign-in (fixed)

What existed when the review ran: `requestMagicLink` validated the address
and called `signIn("nodemailer", …)` unconditionally. There was no rate
limit, no captcha, and no per-address or per-IP throttle anywhere in `src/`.
An unauthenticated caller could therefore make the platform send mail to
arbitrary addresses (SMTP quota, deliverability and domain reputation),
write one `verification_tokens` row per request, and spend database work per
request.

It is now a durable fixed-window limiter, checked **before** the send, on
two dimensions: the **address** (the durable guarantee — a caller cannot
forge it, since mail-bombing a victim means spending the victim's bucket,
and it holds even when the source is unknown or rotates) and the **source
IP** (defence in depth for one host working through many addresses,
deliberately the looser limit because a venue shares one connection, and
skipped entirely when no plausible address is available rather than bucketed
under a shared "unknown" that could lock everyone out).

It needed no new dependency or service, which is what the earlier
recommendation was really solving for: Postgres is already required for
sign-in, so it is the durable store. One atomic upsert per dimension, so
concurrent attempts cannot both read a stale count; the count is incremented
and _then_ judged, so a blocked caller keeps the window blocked; stale
windows are pruned as new ones begin, so the table stays the size of "what
is happening now"; keys are HMACs, so the table cannot be read as a list of
who tried to sign in; and an erroring store **fails closed** with a "try
again shortly" message, because the database is required for sign-in
anyway. Defaults live in one place: 3 attempts per address and 20 per source
per 15-minute window.

What it deliberately does not cover — so this is a fixed finding with known
edges, not a solved problem:

- **No global ceiling.** A caller working through many addresses from many
  sources is bounded per bucket, not in total. An edge rule keyed on the
  sign-in path (a hosting-provider WAF rule) is still the right outer layer,
  and it stays on the before-onboarding checklist.
- **No captcha**, so a determined distributed caller pays in cost and noise
  rather than being stopped.
- **Fixed windows** permit a burst at a boundary (at most 2x the limit in a
  moment) — irrelevant next to the cost of sending mail, and the price of
  one row per key per window instead of one per attempt.
- **The source dimension is only as trustworthy as the proxy that sets
  `x-forwarded-for`.** On the target hosting that is the platform's own
  proxy, which is why the dimension is kept loose; behind a bare Node server
  the header is spoofable, and the address dimension is what holds there.
- **Counters are per environment and platform-wide.** Correct for sign-in
  (there is no tenant to scope them to), but it also means they are not a
  per-restaurant budget.

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

### What proves the sign-in limit (F3)

Four layers, each pinning what the one below cannot:

1. `src/lib/signin-rate-limit.test.ts` — the decision, the window
   arithmetic, the key derivation and the fail-closed path, against an
   injected store, so the boundary is asserted without a database.
2. `src/lib/signin-rate-limit-live.test.ts` — the real upsert: an atomic
   concurrent burst, the pruning of stale windows, and that only hashes are
   ever stored.
3. `src/app/login/actions.test.ts` — that the check runs _before_ `signIn`,
   that a refusal sends nothing, and that an unavailable limiter is an error
   rather than a silent send.
4. `e2e/signin-rate-limit.spec.ts` — the real form in a real browser until
   it is refused: the inline message, the absent redirect to
   "check your email", exactly three messages in Mailpit, no fourth, and
   that a spent address does not lock out another.

Mutation-checked in both layers: disabling the window comparison fails both
E2E specs, an always-allowing decision fails the boundary test, and an
upsert that stops incrementing fails four of the six live tests.

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

## Verification log — F3 fix (2026-10-16)

| Check                                       | Result                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npx vitest run` with `TEST_DATABASE_URL`   | **620 passed / 51 files** (was 593 / 49)                                                          |
| `npx vitest run` without a database         | **568 passed, 52 skipped** — the live suites opt out rather than silently passing                 |
| `npm run check`                             | green (lint, strict typecheck, format)                                                            |
| `npm run build`                             | green                                                                                             |
| `npx playwright test`                       | **17/17 passed**, twice back to back inside one rate-limit window                                 |
| Refusal, on the running server              | 4th attempt: inline error, no redirect, and Mailpit holds exactly 3 messages — the send never ran |
| Mutation: window comparison disabled        | both E2E specs fail                                                                               |
| Mutation: refusal branch disabled           | exactly the two refusal unit tests fail                                                           |
| Mutation: upsert stops incrementing         | four of the six live tests fail                                                                   |
| `db:generate` after formatting the metadata | zero schema drift; `db:migrate` unaffected                                                        |

One harness fact worth recording, because it will recur:
running the **whole** E2E suite (not the new spec alone) exposed that the
source-IP dimension is a single bucket shared by every spec and every run
from one developer machine — 20 per window against the suite's 9 — so the
fourth `npm run test:e2e` inside a window refused the owner journey's own
sign-in and looked like a broken email path. Global setup now clears the
counters, since they are app state rather than fixture state, and the purge
of Mailpit is scoped to a spec's own recipients so parallel specs cannot
delete each other's mail.

## Before onboarding a pilot customer

- [ ] Add the outer edge rule for sign-in (a hosting-provider WAF rule on the
      path) if the deployment offers one: the in-app limiter (F3) bounds each
      address and each source, but there is no global ceiling, and a captcha
      is out of scope for the pilot.
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
