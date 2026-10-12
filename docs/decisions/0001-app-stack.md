# 0001 — Application stack (decided 2026-10-12)

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict.
- Tailwind CSS v4 for styling; no UI kit.
- npm with lockfile; Node 22 pinned in `.nvmrc`.
- Quality gates: ESLint (`eslint-config-next` + `eslint-config-prettier`),
  Prettier, `tsc --noEmit`, `next build`. Combined as `npm run check`.
- `local/` is the git-ignored scratch folder (see `local/README.md`).
- Standing agent rules live in `AGENTS.md`; plan lives in `ROADMAP.md`.

Rationale: stay on the default Next.js path, keep the foundation generic
until Phase 0.2 scope is confirmed. Revisit only if the MVP needs
something this stack cannot do.
