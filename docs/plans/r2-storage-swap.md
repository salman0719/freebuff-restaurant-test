# Plan: R2 storage swap — three bounded commits

**Scoped:** 2026-10-16 during Phase 6.3 (after the performance,
accessibility, and font slices). **Status:** not started — waiting on the
account setup listed under "What I need" below. **Owner:** unassigned.

## Why this, in this order

1. **Persistence is broken in production.** The Phase 3.6 driver is a
   local-filesystem implementation of the provider-neutral adapter that
   decision 0002 §5 always intended for R2. Uploaded logos and item
   photos are written under `local/uploads` — fine on a laptop, ephemeral
   on Vercel, where the filesystem is replaced on every deploy and every
   instance. Every upload a pilot restaurant makes today disappears at
   the next deploy.
2. **Turbopack cannot scope the driver's file access.** The three
   dynamic-path call sites (`storage.ts` path resolution from
   `process.cwd()` + env + validated key, and the `readFile`) make
   Turbopack trace the whole project into the server bundles for the
   image route and anything importing `tenant-data.ts` — recorded in
   `docs/tech-debt/turbopack-storage-tracing.md` with a size-limit risk
   as the project grows.
3. **Image weight: originals are stored, display sizes are served.** An
   owner uploads a phone photo (up to the 2 MB cap); the public menu
   renders it in a card a few hundred pixels wide. Resizing on write
   keeps the same rendering at a fraction of the stored and served bytes.

The adapter exists precisely so this is a driver swap, not a caller
rewrite: `putObject` / `getObject` / `deleteObject` /
`isValidObjectKey` / `buildObjectKey` keep their signatures and the
`tenants/{uuid}/logos|items/{uuid}.{ext}` key shape, so the database,
the capability-URL serving route, and the tenant-isolation suite are
untouched.

## Commit 1 — R2 driver (persistence)

- Add the S3-compatible client (`@aws-sdk/client-s3`; R2 speaks the S3
  API) and `src/lib/storage-r2.ts` implementing the adapter shape.
- Driver selection by environment: `STORAGE_DRIVER=fs|r2`, defaulting to
  `r2` when `R2_ACCOUNT_ID` is present and `fs` otherwise, so local dev
  keeps working with zero setup and deployed environments are R2 by
  construction. A missing R2 config in a deployed environment fails the
  upload loudly (a `ServiceResult` error the editors already render),
  never silently.
- The bucket stays **private**. Serving keeps flowing through
  `/api/images/[...key]` — the unguessable-key capability URLs, the
  sniffed-extension allowlist, and the route's cache headers all stay as
  they are. No public bucket access, no signed URLs, no caller changes.
- Tests: the existing `storage.test.ts` contract suite runs against both
  drivers (fs always; the R2 driver against the real dev bucket when
  `R2_*` is set). `tenant-isolation.test.ts` and the image route tests
  keep passing unchanged — that is the point of the shared key shape.
- **Done when:** an upload through the owner editor on a Vercel preview
  deployment is still there after a fresh redeploy of that preview, and
  `npm run check` + the full suite are green.

## Commit 2 — Turbopack tracing fix

- With the fs driver off the deployed request path, the three dynamic
  accesses no longer sit in any production route's graph. If the dev
  fallback remains a static import, make it reachable only behind the
  driver selector (or annotate the call sites) so the warnings cannot
  come back.
- Keep the structural guards whatever happens: the strict key allowlist
  and the contained-resolve traversal check survive any driver.
- **Done when:** `npm run build` prints zero "causes tracing of the
  whole project" warnings, confirmed on a Vercel **preview** build log —
  the local log alone was not enough evidence last time.

## Commit 3 — resize-on-write (image weight)

- Resize during upload, before `putObject`: the logo to a square at most
  256 px (rendered at 96–112 px, DPR 2 headroom) and item photos to at
  most 1280 px wide, encoded WebP — the format the 6.3 performance pass
  already measured as smaller and faster than AVIF on this content.
- Library: `sharp` on the Next.js server (native binaries, fine on
  Vercel functions). This is a dependency the project rule says to ask
  for; Cloudflare Images would add a second paid service and a second
  key space for little gain at this scale.
- The stored key shape stays as is, so callers, the serving route, and
  the isolation tests again do not change. The 2 MB upload cap stays as
  the input guard; stored bytes drop well below it.
- **Done when:** `local/perf-images.mjs` (the 6.3 harness) shows the
  before/after served bytes per public page for the four published
  tenants, upload→serve→display is verified in a browser at 390 px and
  1280 px, and the visual result is compared against the current build.

## What I need from you (exact)

Account setup — about ten minutes in the Cloudflare dashboard:

1. **A Cloudflare account** (free tier is enough for the pilot: R2's
   free allotment is 10 GB-month storage with 1 M Class A and 10 M
   Class B operations per month, and R2 charges no egress to the
   internet).
2. **Create the bucket:** R2 → Create bucket, e.g.
   `restaurant-app-images`. One bucket is enough — the tenant id is
   already the first key segment. A separate `-staging`/`-production`
   pair is also fine; tell me which you chose.
3. **Create an API token scoped to that bucket:** R2 → Manage R2 API
   Tokens → Create API token → permission **Object Read & Write** →
   "Apply to the bucket" → pick the bucket (do **not** grant
   account-wide Object Read & Write). It returns an **Access Key ID**
   and a **Secret Access Key** (the secret is shown once — copy it
   then).
4. **The account ID** — 32 hex characters, shown on the R2 overview
   page and on the token page.
5. **Where the values go — never in chat:** Vercel → Settings →
   Environment Variables, for **Production and Preview**, named exactly:
   - `R2_ACCOUNT_ID`
   - `R2_BUCKET`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`

   and the same four lines in your local `.env.local` (git-ignored) for
   local runs. Optional override if you ever need it:
   `R2_ENDPOINT`.

Not needed: any account-wide or root token, DNS changes, a Workers paid
plan, public bucket access, or Cloudflare Images. Optional nicety: run
`npx wrangler login` on this machine if you would rather I exercise the
R2 driver against a local Miniflare bucket instead of the real dev
bucket.

Dependency approvals (project rule is to ask): `@aws-sdk/client-s3` for
commit 1, `sharp` for commit 3.

## Rollback and data

- The driver is environment-selected: clearing `R2_*` (or setting
  `STORAGE_DRIVER=fs`) restores the local driver for development.
- No schema changes, no key-shape changes, so there is **no data
  migration**: uploads never persisted in production to migrate, and dev
  files under `local/uploads` stay where they are (re-seed with
  `local/seed-logos.mjs` if a dev database is reset).
- If R2 is down, uploads fail with the editors' existing error surface
  and serving falls back to a clear 5xx from the image route — the same
  failure behaviour the local driver has when a file is missing.

## Related

- `docs/tech-debt/turbopack-storage-tracing.md` — the warning this
  retires (commit 2 closes it).
- `src/lib/storage.ts` — the driver being swapped; its header records
  the 0002 §5 decision this plan executes.
- ROADMAP Phase 6.3 "Still open" — points here.
