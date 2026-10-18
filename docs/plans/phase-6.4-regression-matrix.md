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
fixture. The owner-validation and public-isolation specs use UUID-suffixed
tenants/accounts; operator provisioning uses its own named fixtures with
pre-run and teardown cleanup, and domain-claim uses a timestamped fixture.
Each suite owns its fixture lifecycle rather than sharing mutable tenant state.
For a focused rerun:

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
  local bucket contract calls were not part of this matrix run. All 10
  database-gated suites ran against local Docker Postgres.
- Targeted `npm run typecheck`, changed-file Prettier check, and ESLint on the
  E2E tree passed. `git diff --check` passed.
- `npm run check` did **not** pass: its repository-wide ESLint traverses
  ignored local scratch files, where
  `local/ubereats-menu-extraction/content.js:14` assigns to the forbidden
  `module` global; it also reports existing unused-variable warnings under
  `local/`. Rechecking the project's CI lint scope
  (`eslint src db e2e scripts *.config.mjs *.config.ts`) passes. No unrelated
  scratch files were changed to conceal the issue.

The local result is tied to the tested working tree containing
[`e2e/owner-validation.spec.ts`](../../e2e/owner-validation.spec.ts)
(commit `c091bbd`); the later documentation commit adds no runtime changes.
CI for the revision and Vercel Preview/redeploy evidence remain pending, not
inferred from local tests.

## Release-gate run (2026-10-18)

Full gate on a clean tree at `f7ec7b6` (`feature/configurable-brand-expressions`),
Node v22.23.2, Playwright 1.64.0, Postgres 17.11, Mailpit on :8025:

- `docker compose up -d` → `npm run db:migrate` (journal already current).
- `npm run build` — passed (Next.js 16.4.0 / Turbopack), then
  `npm run perf:budget` — **PASS**, public-route client JS within budget.
- `npm run test:e2e` — **19 passed** (22.5 s, Chromium, production build),
  including owner validation, full owner journey, public tenant isolation,
  operator provisioning/access, sign-in rate limit, and domain claim.
- `TEST_DATABASE_URL=… npm run test:run` — **670 passed, 2 skipped**. The
  skips are the two R2 live-bucket cases: `R2_BUCKET` is empty in
  `.env.local`, so that suite stays opt-in exactly as its own header says.
- `npm run check` — exit 0 (lint 0 errors, typecheck, Prettier clean).

**What the run caught:** the takeaway brand-direction work was uncommitted
at the time and rendered the restaurant logo twice — a new brand chip beside
the h1 plus the hero panel — both with the same accessible name, so
`owner-journey`'s strict `getByRole("img", …)` matched two elements and the
suite ended 18/19. The chip is decorative (the restaurant name follows
immediately), so it now carries `alt=""`; the spec stayed strict and
unchanged. Feature and fix were committed as one (`f7ec7b6`), the tree is
clean, and the rerun is 19/19.

**Lint limitation resolved:** the earlier run's repository-wide blocker
(`local/ubereats-menu-extraction/content.js`) is gone from the workspace,
so `npm run check` exits 0 today — its single warning is an unused variable
in a git-ignored `local/` harness, which links do not reach CI.

**Still outstanding for the exit rule:** CI green for `f7ec7b6`, and the
Vercel Preview build-log / upload-through-redeploy checks (this checkout has
no `.vercel/project.json`; no deployment was attempted from here).

## Recording a run

For each release candidate, record the commit SHA, date, Node version,
Postgres version, Playwright summary, and whether the Vercel Preview checks
were run. Keep the compact result here or link to the CI run; do not paste
secrets, customer content, full environment dumps, or raw auth tokens.

| Run                             | Revision  | Build  | E2E       | Live DB tests                  | Preview/redeploy evidence | Notes                                                                                                 |
| ------------------------------- | --------- | ------ | --------- | ------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-10-17 local acceptance run | `c091bbd` | Passed | 19 passed | 664 passed; 2 R2 tests skipped | Not run                   | `npm run check` blocked by ignored scratch JS; scoped lint passed. Hosted CI pending.                 |
| 2026-10-18 release-gate run     | `f7ec7b6` | Passed | 19 passed | 670 passed; 2 R2 tests skipped | Not run                   | Clean tree; Node 22.23.2 / Postgres 17.11 / Playwright 1.64.0. `npm run check` + `perf:budget` green. |

## Exit rule

Call 6.4 complete only when the matrix passes against the production build,
CI is green for the same revision, and the distinct Preview/deploy checks
are recorded as either verified or explicitly blocked. A local build is not
a Preview build, and an isolated visitor context is not a redeploy test.

**Standing after the 2026-10-18 run:** the local gate is green at
`f7ec7b6`. Two items remain before 6.4 can be marked complete — CI green
for that revision, and the Preview/deploy checks recorded as verified or as
explicitly blocked.
