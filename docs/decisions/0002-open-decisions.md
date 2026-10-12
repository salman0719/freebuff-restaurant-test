# 0002 — Architecture decisions (decided 2026-10-12)

Researched and agreed with the owner. Sources consulted are linked per
item; recheck quotas/pricing before launch.

## 1. Database: local Docker now, Neon later (decided)

- Start with local Docker Postgres (persistent volume). Drizzle ORM +
  `drizzle-kit generate`/`migrate` with committed SQL migrations (never
  `push` for shared history).
- One standard Node driver (`postgres.js` or `pg`) behind a single
  server-only connection module; env-based URLs so the Neon move is a
  config change, not a code change.
- Neon Free (1 GB storage, 100 CU-hours/mo, scales to zero) fits the MVP
  when a hosted DB is needed; use pooled URL at runtime, direct URL for
  migrations. One shared database with `tenant_id` columns — never one
  project/branch per tenant. ([Neon pricing](https://neon.com/pricing),
  [Drizzle + Neon](https://orm.drizzle.team/docs/connect-neon))

## 2. Auth: NextAuth v5 beta (decided, with eyes open)

- Package is still `next-auth`; v5 is prerelease (`next-auth@beta`,
  beta.32+) but explicitly declares Next 16 peer support, while v4 does
  not. Use v5 beta + `@auth/drizzle-adapter`.
- Yes, it is enough: store `operator`/`owner` roles on the user record,
  expose via session callback, check server-side with `auth()` in Server
  Components, route handlers, and data access. Route-gate in `proxy.ts`
  (Next 16's `middleware.ts` successor) but always re-check near the
  data. Caveats: v5 is beta (pin the version, test upgrades), and never
  put request-time session reads inside a `"use cache"` scope.
  ([Auth.js v5 guide](https://authjs.dev/getting-started/migrating-to-v5),
  [RBAC guide](https://authjs.dev/guides/role-based-access-control))

## 3. Tenant identification (proposal — see 0003)

Subdomain slug + custom-domain mapping, resolved in `proxy.ts`. Full
proposal in `docs/decisions/0003-tenant-identification.md`.

## 4. Tests: Vitest + RTL + Playwright (decided)

- Unit/component: Vitest + React Testing Library (React 19 supported
  since RTL v16.1). Async Server Components are NOT unit-testable —
  cover them with Playwright.
- E2E: Playwright against production build (`next start` via `webServer`).
- Scripts: `test` (watch), `test:run`, `test:coverage`, `test:e2e`. CI
  order: install → unit → build → browsers → e2e.
  ([Next.js testing guides](https://nextjs.org/docs/app/guides/testing))

## 5. File storage: Cloudflare R2 (decided)

- R2 Standard free tier (10 GB-months, 1M Class A + 10M Class B ops,
  free egress) dwarfs Vercel Blob Hobby (1 GB, hard stop) and Supabase
  Storage free (1 GB, pauses when idle).
- Pattern: server authorises → signs short-lived PUT URL (S3-compatible
  API, no Worker needed) → browser uploads direct → DB stores a
  provider-neutral object key behind an `upload`/`delete`/`getPublicUrl`
  adapter. Serve public images via a custom domain, not `r2.dev`.
  ([R2 pricing](https://developers.cloudflare.com/r2/pricing/),
  [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/))

## 6. Deployment: Vercel (decided — the idea was right)

- The plan works: Vercel auto-CI/CD from GitHub with PR previews;
  wildcard `*.platform.com` works even on Hobby; custom domains are
  added **programmatically** via the project-domain API + verification
  polling (no per-domain dashboard clicking); SSL auto-issues.
- Caveats: Hobby caps at 50 custom domains (Pro effectively unlimited);
  handle apex vs `www` separately; tenants keep DNS control for
  verification; consider Public Suffix List submission for cookie
  isolation between tenant subdomains.
  ([Multi-tenant docs](https://vercel.com/docs/platforms/multi-tenant-platforms/configuring-domains),
  [limits](https://vercel.com/docs/platforms/multi-tenant-platforms/limits))

## 7. CI: GitHub Actions + Vercel checks (decided)

- Vercel handles deploy CD (prod + previews) automatically. Its native
  Deployment Checks cover lint/typecheck when the scripts exist.
- Add GitHub Actions for the rest: `npm run check` + `test:run` on every
  push/PR, then build + Playwright e2e; surface results as Vercel
  deployment checks to gate promotion. Playwright browsers install via
  `npx playwright install --with-deps`.
  ([Playwright CI](https://playwright.dev/docs/ci-intro))
