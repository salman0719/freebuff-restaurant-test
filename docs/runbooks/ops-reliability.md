# Ops reliability runbook (Phase 6.2)

Support-facing map of how the platform behaves when something it depends
on fails, and what to do about it. The promise throughout: a failure is
reported as a failure — never as success, never as "not found", never as
"live".

## Health endpoint

`GET /api/health` — unauthenticated on purpose, so load balancers and
uptime monitors can reach it without a session.

- `200 { status: "ok", checks: [...] }` — database and storage both answer.
- `503 { status: "degraded", checks: [...] }` — at least one does not.
  Each check carries only a name, a boolean, and a latency. There is
  deliberately nothing else: no versions, no driver messages, nothing an
  attacker can learn from. The actionable detail goes to the server log
  (see below), not the response.
- A probe slower than 5 s counts as down, not as slow — a hung dependency
  must degrade the report, not hang the monitor.

Point an uptime check at it and alert on non-200. It is intentionally
outside `npm run smoke`'s route list: `200` and `503` are both
legitimate answers there depending on dependency state, while the smoke
check asserts exact statuses.

## Logs

One JSON line per event: `ts`, `level`, `event`, `message`, optional
`context`. `info` goes to stdout, `warn`/`error` to stderr — tail the
error stream and the failures come without the noise.

Two guarantees, both tested (`src/lib/server-log.test.ts`):

- **Secrets never reach the log.** Any key naming a credential
  (`*_TOKEN`, `*_SECRET`, `DATABASE_URL`, cookies, authorisation
  headers…) is replaced with `[redacted]` at any depth, structurally —
  not by caller discipline. If you see a real secret in the logs, that
  is a bug: file it, rotate the secret, fix the key list.
- **Context is facts, not rows.** Callers log ids, slugs, and outcome
  flags — never menu text, contact details, or result payloads. Strings
  truncate at 1000 chars, objects at 50 keys, depth at 4, so one event
  cannot flood the log. Logging itself never throws: a broken sink must
  not break the request it describes.

In Vercel, these lines land in the function logs; filter by
`"level":"error"` or by `event` (e.g. `health.degraded`).

## What each failure looks like

| Dependency down | Visitor sees | Owner sees | State afterwards |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- || Database | Public page renders "temporarily unavailable" with a retry — identical for every hostname, so an outage never reads as "not published" and never oracles which hosts are real. Dashboard/operator show their error boundaries with retry; saves fail as errors, never false success. | Nothing half-written: every mutation is a single write that either commits or throws. A publish toggle cannot leave the site "half published". |
| Upload storage | Public images 404 (missing file reads as missing, as before). | Logo/photo save returns an honest failure ("profile saved, but the logo was not updated") with no link written — nothing points at bytes that were never stored, and no orphan file is left (`src/lib/storage-failure-live.test.ts`). | Row unchanged; retry later. |
| Vercel API (domains) | Nothing — visitors never depend on it. | Domain attach/detach/check reports `pending` with the reason, never `live`. Removal always stops serving the domain locally even if the provider detach fails (stated, not blocking). See `docs/runbooks/domain-lifecycle.md`. | Claim stays `verified`; liveness folds back to `pending` until routing + HTTPS probe all hold (5.3 truth table, 5.4 lifecycle suite). |
| Mail provider | — | Sign-in link request fails closed with "try again shortly"; rate-limit counters fail closed the same way. | No partial session; retry later. |

Error copy everywhere is generic on purpose. The reference a visitor
can quote (the error digest, where present) matches the server log —
ask for it, then look the minute up in the function logs.

## Database backup and restore

**Local (Docker):** data lives in the `pgdata` volume. Before anything
risky:

```bash
docker compose exec db pg_dump -U app restaurant_app > backup-$(date +%F).sql
# Restore to a fresh volume:
docker compose down -v
docker compose up -d db
cat backup-YYYY-MM-DD.sql | docker compose exec -T db psql -U app restaurant_app
npm run db:migrate  # belt and braces: migrations are idempotent
```

**Production: open item — close before pilot onboarding.** The app
reaches Postgres through `DATABASE_URL` and keeps migrations versioned
and idempotent (`db/migrations/`, never reset a production database to
make one work), but the provider's own backup story (automated
snapshots, point-in-time recovery, retention) is not yet confirmed for
the database behind the production `DATABASE_URL`. Required before real
customer data lands:

1. Name the provider and record its backup/PITR/retention terms here.
2. Prove a restore: snapshot → restore to a scratch database → point a
   staging build at it → run the E2E suite green.
3. Until then, take a `pg_dump` before every production migration and
   keep it with the deploy notes.

Migration discipline (unchanged): versioned files, test the path on a
development database first, explicit approval for anything destructive.

## The Suspense-hole lesson (so nobody re-learns it)

The public page resolves its tenant inside `<Suspense>` (partial
prerender: shell streams first, tenant content resumes after). Verified
against a production server with the database down: a throw inside that
hole does **not** reach `error.tsx` or `global-error.tsx` — it resolves
to the not-found page, whose "isn't published yet" copy is a lie during
an outage. So `src/app/page.tsx` catches dependency failures itself and
renders `SiteUnavailable` inline (logged, redacted, identical for every
host). The segment `error.tsx` and root `global-error.tsx` stay for
failures outside the hole. Rule: anything the page _depends on_ gets an
inline failure render; boundaries are the backstop, not the plan.

Known wart (same class as 5.1's): the unavailable state answers HTTP
200 with honest _content_. Status-based monitors should watch
`/api/health` (503 when degraded), not `/`.

## Incident checklist

1. `GET /api/health` — which check is red narrows it to database vs
   storage in one call.
2. Error-stream logs around the minute — the `event` names the
   subsystem, the `message` says what the driver reported.
3. Common cases:
   - `health.degraded` naming `database` after a deploy → connection
     string / migration state first (`npm run db:migrate` output),
     provider status second.
   - Upload failures with storage healthy → disk full or permissions
     on `STORAGE_DIR`, not the app.
   - Domain "stuck pending" → `docs/runbooks/domain-lifecycle.md`
     triage table, not this page.
4. After recovery, re-run `npm run smoke` against the deployment
   before calling it done — an outage that also disturbed routing
   should fail the release gate, not the next visitor.
