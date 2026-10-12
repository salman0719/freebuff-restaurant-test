# Agent Rules — restaurant-app

Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 project.
Theme: restaurant (menu, reservations, etc. — to be defined later).
Keep the foundation generic until the theme brief lands.

## Commands (npm)

- `npm run dev` — start dev server (Turbopack)
- `npm run build` — production build (must pass before PRs)
- `npm run start` — serve production build
- `npm run lint` / `npm run lint:fix` — ESLint check / auto-fix
- `npm run format` / `npm run format:check` — Prettier write / check
- `npm run typecheck` — `tsc --noEmit` (strict)
- `npm run check` — lint + typecheck + format:check (run before committing)
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

## Checks before finishing

1. `npm run check` must be green.
2. `npm run build` must succeed for user-facing changes.
3. Fix the cause of a failing check — never weaken assertions,
   swallow errors, or add lint/type suppressions to force a pass.

## Git

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Small focused commits. Never commit unrelated files.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
