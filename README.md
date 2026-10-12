# restaurant-app

Multi-tenant website platform for independent restaurants, cafés, and
takeaway shops. See [ROADMAP.md](ROADMAP.md) for the plan and
[docs/product-scope.md](docs/product-scope.md) for the MVP scope.

## Prerequisites

- Node 22 (see [.nvmrc](.nvmrc); `nvm use` picks it up)
- npm (dependencies are locked in `package-lock.json`)

## Setup

```bash
npm ci
cp .env.example .env.local   # no variables required yet; placeholders only
npm run dev                  # http://localhost:3000
```

## Scripts

| Command                           | Purpose                                 |
| --------------------------------- | --------------------------------------- |
| `npm run dev`                     | Start dev server (Turbopack)            |
| `npm run build`                   | Production build (must pass before PRs) |
| `npm run start`                   | Serve production build                  |
| `npm run lint` / `lint:fix`       | ESLint check / auto-fix                 |
| `npm run format` / `format:check` | Prettier write / check                  |
| `npm run typecheck`               | `tsc --noEmit` (strict)                 |
| `npm run check`                   | lint + typecheck + format:check         |
| `npx tsx <file.ts>`               | Run one-off TypeScript scripts          |

Run `npm run check` before committing; `npm run build` must succeed for
user-facing changes. No test runner yet — see
[docs/decisions/0002-open-decisions.md](docs/decisions/0002-open-decisions.md).

## Conventions

- Agent rules live in [AGENTS.md](AGENTS.md).
- `local/` is git-ignored scratch space for internal testing (see
  [local/README.md](local/README.md)).
- Path alias `@/*` maps to `src/*`. Server Components by default.
