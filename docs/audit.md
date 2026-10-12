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
| `npm test`             | **Missing** — no test runner installed yet    |

## Gaps / blockers

1. No test runner or test script (decision needed — see
   `docs/decisions/0002-open-decisions.md`).
2. No CI workflow yet.
3. No `.env.example` yet (no env vars required so far).
4. Architecture decisions (DB, auth, tenant resolution, storage,
   deployment) not yet made — see Phase 0.3.
5. One scaffold bug found and fixed: the default `LayoutProps<"/">` in
   `src/app/layout.tsx` broke `tsc` without generated route types;
   replaced with `Readonly<{ children: React.ReactNode }>`.

## Conventions in force

See `AGENTS.md`. Git history is small focused conventional commits on
`main`; `local/` is the git-ignored scratch folder.
