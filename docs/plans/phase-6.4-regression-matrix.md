# Phase 6.4 regression matrix

**Purpose:** Repeatable release evidence for the end-to-end scenarios in
[ROADMAP.md](../../ROADMAP.md#L1627-L1633). This is a browser suite against a
built Next.js server and real Postgres; it is not a mocked component tour.

## Run it locally

Prerequisites: Node 22, dependencies installed, Docker Postgres + Mailpit,
valid local auth/mail settings, migrations applied, and the local R2 values
present if exercising upload coverage (see [.env.example](../../.env.example)).
The E2E specs write disposable records to `DATABASE_URL`; use a disposable
local/test database, never production.

```bash
docker compose up -d
npm run db:migrate
npm run build
npm run test:e2e
```

Playwright starts the production build on `http://localhost:4030` and runs
Chromium. `e2e/global-setup.ts` resets the dedicated `e2e-bistro` owner
fixture; every other journey owns a UUID-suffixed tenant/account and removes
it in teardown. For a focused rerun:

```bash
npm run test:e2e -- --grep 'owner profile validation (6.4)'
npm run test:e2e -- --grep 'public tenant isolation (6.4)'
```

The CI equivalent is the final step of [.github/workflows/ci.yml](../../.github/workflows/ci.yml):
GitHub Actions provisions Postgres + Mailpit, migrates an empty database,
builds, installs Chromium, then runs the full suite.

## Matrix and current evidence

| Acceptance case                                                                                               | Repeatable check                                                                                              | Current evidence / remaining limit                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator creates restaurant, chooses initial theme, grants owner, records the act, and invited owner opens it | `e2e/operator-provisioning.spec.ts`                                                                           | Browser suite covers happy path and invalid slug, duplicate slug, duplicate grant, and non-operator refusals.                                                                                                                            |
| Owner accesses the correct tenant and completes profile, menu, hours, theme, and preview                      | `e2e/owner-journey.spec.ts`                                                                                   | Real magic-link path via Mailpit; fixture begins as draft and ends unpublished.                                                                                                                                                          |
| Invalid owner input is an error, not false success                                                            | `e2e/owner-validation.spec.ts`                                                                                | Sends whitespace-only required restaurant name through the server action; asserts general and field errors, invalid field state, typed-value retention, no success status, zero profile write, then corrected save and persisted reload. |
| Published visitor sees the correct tenant's content and image                                                 | `e2e/owner-journey.spec.ts`                                                                                   | Public hostname, menu, WebP logo bytes, and fresh visitor context are checked after publish.                                                                                                                                             |
| Unknown and unpublished tenants reveal no private/draft content                                               | `e2e/public-tenant-isolation.spec.ts`                                                                         | Same generic not-found heading and no draft description/menu for unknown vs unpublished host.                                                                                                                                            |
| Tenant boundary protects public and private views                                                             | `e2e/public-tenant-isolation.spec.ts`                                                                         | One published tenant cannot display its neighbor's public content; owner A cannot access B's profile; publish/unpublish B affects B only.                                                                                                |
| Publish visibility changes are correct                                                                        | Owner and public-isolation specs                                                                              | Owner journey publishes the UI fixture; isolation test flips a second tenant and confirms before/after visibility and neighbor stability.                                                                                                |
| Sign-in refusal has honest feedback and does not send mail                                                    | `e2e/signin-rate-limit.spec.ts`                                                                               | Exhausts the configured address budget, observes inline wait guidance, confirms the blocked attempt adds no Mailpit message and another address remains unaffected.                                                                      |
| Custom-domain verification/refusal has honest feedback                                                        | `e2e/domain-claim.spec.ts`                                                                                    | Covers not-yet-seen / DNS-query failure without false verification, domain conflict, switch, and removal. Depends on external DNS behavior, while asserting the invariant rather than one resolver's message.                            |
| Owner-uploaded image survives a redeploy                                                                      | `e2e/owner-journey.spec.ts` tests upload and an independent browser context; deployment-specific continuation | A fresh visitor context proves no browser-cache dependency. It does **not** prove survival across a Vercel redeploy. That needs the production/Preview deployment check recorded below.                                                  |
| Hosting build trace warnings and preview behavior                                                             | Vercel Preview build                                                                                          | Not verified from this checkout: no `.vercel/project.json` is present; local E2E/build evidence cannot substitute for a Vercel Preview deployment/log.                                                                                   |

The complete suite may include domain-claim resolution dependent on the test
network. It must never pass by skipping a required test or treating an
unverified claim as live.

## Verified local acceptance run (2026-10-17)

On the working revision before its atomic commits:

- `npm run db:migrate` — passed; local migration journal was already current.
- `npm run build` — passed on Next.js 16.4.0 / Turbopack.
- `npm run test:e2e` — **19 passed**, Chromium, production build + local
  Postgres + Mailpit; includes owner validation, full owner journey, public
  tenant isolation, operator provisioning/access, sign-in rate limit, and
  domain claim/refusal.
- `TEST_DATABASE_URL=postgresql://app:secret@localhost:4432/restaurant_app npm run test:run`
  — **664 passed, 2 skipped**. The skips are the two R2 live-bucket cases;
  local bucket calls were not part of this matrix run. All 11 DB-gated suites
  ran against local Docker Postgres.
- Targeted `npm run typecheck`, changed-file Prettier check, and ESLint on the
  E2E tree passed. `git diff --check` passed.
- `npm run check` did **not** pass: its repository-wide ESLint traverses
  ignored local scratch files, where
  `local/ubereats-menu-extraction/content.js:14` assigns to the forbidden
  `module` global; it also reports existing unused-variable warnings under
  `local/`. Rechecking the project's CI lint scope
  (`eslint src db e2e scripts *.config.mjs *.config.ts`) passes. No unrelated
  scratch files were changed to conceal the issue.

The pending row below is a **release-specific record template**, not a claim
that this uncommitted working revision has a CI or Vercel deployment result.
Update it only after a clean revision receives those results.

| Run                              | Revision       | Build             | E2E               | Preview/redeploy evidence | Notes                                                                      |
| -------------------------------- | -------------- | ----------------- | ----------------- | ------------------------- | -------------------------------------------------------------------------- |
| Release CI / Vercel verification | pending commit | CI status pending | CI status pending | Not run                   | Local results above are verified; hosted checks await a released revision. |

## Recording a run

For each release candidate, record the commit SHA, date, Node version,
Postgres version, Playwright summary, and whether the Vercel Preview checks
were run. Keep the compact result here or link to the CI run; do not paste
secrets, customer content, full environment dumps, or raw auth tokens.

| Run                             | Revision       | Build   | E2E     | Preview/redeploy evidence | Notes                                                                                        |
| ------------------------------- | -------------- | ------- | ------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| 2026-10-17 local acceptance run | pending commit | pending | pending | Not run                   | Run commands above after this change is committed; hosted evidence remains separately gated. |

## Exit rule

Call 6.4 complete only when the matrix passes against the production build,
CI is green for the same revision, and the distinct Preview/deploy checks are
recorded as either verified or explicitly blocked. A local build is not a
Preview build, and an isolated visitor context is not a redeploy test.
