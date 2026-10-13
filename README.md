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
cp .env.example .env.local # placeholders only; PORT=4000 lives here
npm run dev                 # http://localhost:4000
```

Optional local database (Postgres 17, data persists in a Docker volume):

```bash
docker compose up -d         # connection string in .env.example
```

This also starts Mailpit (local SMTP catch-all): inbox UI at
http://localhost:8025, SMTP on `localhost:1025`. For local magic-link
sign-in, uncomment `EMAIL_SERVER`/`EMAIL_FROM` in `.env.local` (values
in `.env.example` match these defaults).

Optional browser database viewer (Adminer, profile-gated so the default
`up -d` is unaffected):

```bash
docker compose --profile tools up -d adminer   # http://localhost:7070
```

Adminer login: system `PostgreSQL`, server `db` (pre-filled), username
`app`, password `secret`, database `restaurant_app`.

## Scripts

| Command                           | Purpose                                 |
| --------------------------------- | --------------------------------------- |
| `npm run dev`                     | Start dev server (Turbopack)            |
| `npm run build`                   | Production build (must pass before PRs) |
| `npm run start`                   | Serve production build                  |
| `npm run lint` / `lint:fix`       | ESLint check / auto-fix                 |
| `npm run format` / `format:check` | Prettier write / check                  |
| `npm run typecheck`               | `tsc --noEmit` (strict)                 |
| `npm run test`                    | Vitest in watch mode                    |
| `npm run test:run`                | Vitest single run (unit + component)    |
| `npm run test:coverage`           | Vitest with V8 coverage                 |
| `npm run test:e2e`                | Playwright E2E (Chromium)               |
| `npm run check`                   | lint + typecheck + format:check         |
| `npx tsx <file.ts>`               | Run one-off TypeScript scripts          |

Run `npm run check` before committing; `npm run build` must succeed for
user-facing changes. Unit tests live next to source as `*.test.ts(x)`;
async Server Component flows are covered by Playwright specs in `e2e/`
against a production build. CI (`.github/workflows/ci.yml`) runs check +
unit + build + E2E on every push and PR.

## Conventions

- Agent rules live in [AGENTS.md](AGENTS.md).
- `local/` is git-ignored scratch space for internal testing (see
  [local/README.md](local/README.md)).
- Path alias `@/*` maps to `src/*`. Server Components by default.
