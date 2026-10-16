# Tech debt: Turbopack "dynamic filesystem access" warnings from the storage driver

**Recorded:** 2026-10-15, during the first production deploy of `main@d5f7c86`.
**Priority:** Low — warnings only, the build succeeds and prod serves. Fix opportunistically.
**Owner:** unassigned.

## Symptom

Vercel build log shows three Turbopack warnings, all rooted in `src/lib/storage.ts`:

1. `storage.ts:93` — `resolve(process.cwd(), process.env.STORAGE_DIR ?? join("local", "uploads"))`
2. `storage.ts:120` — `resolve(storageDir(), key)`
3. `storage.ts:146` — `readFile(full)`

> "Static analysis determined that this filesystem access causes the whole
> project to be traced and included in the output."

Import traces point at `./src/app/api/images/[...key]/route.ts` and
`./src/app/dashboard/[slug]/theme/preview/page.tsx` (via `tenant-data.ts`).

## Why it happens

The local-filesystem storage driver (Phase 3.6) computes paths dynamically
from `process.cwd()` + an env override + a validated key. Turbopack cannot
statically scope that, so it traces the whole project into the server bundle
for those routes. Slow/bloated deployments, and a size-limit failure risk as
the project grows.

## Fix options (pick one when scheduled)

1. **Preferred long-term:** the R2 driver swap (already the plan — 3.6 kept the
   driver behind a provider-neutral key shape precisely for this). Remote
   object storage removes local `fs` access entirely, and the warnings go away
   with the code that causes them.
2. **Cheap short-term:** annotate the three call sites with
   `/*turbopackIgnore: true*/` comments, or statically scope the path
   (e.g. `join(process.cwd(), "local", "uploads", ...)`). Only if the R2 swap
   is far off and bundle tracing becomes a real problem.
3. **Regardless:** keep the key allowlist + contained-resolve traversal guard —
   it is structural and must survive any fix.

## Verification when fixed

- `npm run build` log contains zero "causes tracing of the whole project"
  warnings.
- `npm run check` green; image upload/serve covered by existing tests
  (`src/app/api/images/[...key]/route.test.ts`, live isolation suite).
- Confirm on a Vercel preview build log, not just locally.

## Related

- `src/lib/storage.ts` (driver), `docs/runbooks/` domain docs unaffected.
- Known prod limit recorded 2026-10-15: uploads don't persist on Vercel
  (local driver) — the R2 swap fixes that AND this warning together.
