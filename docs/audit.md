# Phase 0.1 — Repository and tooling audit

Date: 2026-10-12. Status: Done.

## Current state

Fresh scaffold, no product code yet. The default `create-next-app` landing
page is the only route (`src/app/page.tsx`). No database, auth, tests, CI,
or environment variables exist.

## Stack (verified from `package.json` / lockfile)

- Next.js 16.4.0 (App Router, Turbopack) + React 19.3.0
- TypeScript 5 (strict, `tsc --noEmit`), path alias `@/*` → `src/*`
- Tailwind CSS v4 (+ `@tailwindcss/turbopack`)
- ESLint 9 (`eslint-config-next` + `eslint-config-prettier`)
- Prettier 3, `tsx` 4 (one-off TS scripts)
- Package manager: npm. Node pinned via `.nvmrc` (22); verified Node
  v22.23.2, npm 10.9.8.

## Verified commands (all exit 0 on 2026-10-12)

| Command                | Result                                        |
| ---------------------- | --------------------------------------------- |
| `npm run lint`         | Pass (via `npm run check`)                    |
| `npm run typecheck`    | Pass (via `npm run check`)                    |
| `npm run format:check` | Pass (via `npm run check`)                    |
| `npm run check`        | Pass — lint + typecheck + format:check        |
| `npm run build`        | Pass — static `/` + `/_not-found` prerendered |
| `npm run test:run`     | Pass — Vitest (unit + component)              |
| `npm run test:e2e`     | Pass — Playwright Chromium smoke spec         |

## Gaps / blockers

1. ~~No test runner~~ — resolved: Vitest + RTL + Playwright, CI runs
   check + unit + build + E2E (see `.github/workflows/ci.yml`).
2. ~~No `.env.example`~~ — added (placeholders only; `.env.local` holds
   local values, git-ignored).
3. Architecture decisions (DB, auth, tenant resolution, storage,
   deployment) now recorded — see `docs/decisions/0002-open-decisions.md`
   and `0003-tenant-identification.md`.
4. One scaffold bug found and fixed: the default `LayoutProps<"/">` in
   `src/app/layout.tsx` broke `tsc` without generated route types;
   replaced with `Readonly<{ children: React.ReactNode }>`.

## Conventions in force

See `AGENTS.md`. Git history is small focused conventional commits on
`main`; `local/` is the git-ignored scratch folder.
