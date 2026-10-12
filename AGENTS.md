# Agent Rules — restaurant-app

Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 project.
Theme: multi-tenant restaurant platform MVP (public sites, menus, owner
dashboard, operator onboarding). Reservations, ordering, and payments are
post-MVP — see `ROADMAP.md` Phase 8.

## Commands (npm)

- `npm run dev` — start dev server on :4000 (Turbopack)
- `npm run build` — production build (must pass before PRs)
- `npm run start` — serve production build on :4000
- `npm run lint` / `npm run lint:fix` — ESLint check / auto-fix
- `npm run format` / `npm run format:check` — Prettier write / check
- `npm run typecheck` — `tsc --noEmit` (strict)
- `npm run test` / `test:run` / `test:coverage` — Vitest watch / once / coverage
- `npm run test:e2e` — Playwright E2E (Chromium, reuses dev server locally)
- `npm run check` — lint + typecheck + format:check (run before committing)
- `docker compose up -d` — local Postgres 17 (data in `pgdata` volume)
- `npx tsx <file.ts>` — run one-off TypeScript scripts

## Conventions

- App Router in `src/app/`. Path alias `@/*` → `src/*`.
- Server Components by default; add `"use client"` only when needed
  (state, effects, event handlers).
- TypeScript strict. No `any` without justification. Prefer `unknown` + narrowing.
- Tailwind for styling. No global CSS beyond `src/app/globals.css`.
- Images via `next/image`; fonts via `next/font`.
- Keep components small and colocated (`page.tsx`, `layout.tsx`, `_components/`).
- Don't add new deps (UI kits, state libs, DBs) without asking — theme is undecided.
- Don't commit `.env*`, `.next/`, `node_modules/`, or build output.
- Use `local/` for internal testing/scratch work (git-ignored except its README).

## Checks before finishing

1. `npm run check` must be green.
2. `npm run build` must succeed for user-facing changes.
3. Fix the cause of a failing check — never weaken assertions,
   swallow errors, or add lint/type suppressions to force a pass.

## Git

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Small focused commits. Never commit unrelated files.
- Write the commit message as the change's author: no `Co-Authored-By`
  trailers and no generated-with footers, unless the user asks for them.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
