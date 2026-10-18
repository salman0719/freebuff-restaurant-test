# Pilot deployment and support runbook (Phase 6.5)

**Status:** Initial runbook; hosting/database-provider specifics still need
operator confirmation before real customer data or a pilot launch. Related
references: [operations reliability](ops-reliability.md), [platform subdomains](platform-subdomains.md),
[domain lifecycle](domain-lifecycle.md), and [custom domains](custom-domains.md).

## 1. Release and deploy

### Environments and secrets

- Vercel is the intended deployment target; GitHub Actions runs
  [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) on pushes and
  pull requests. A preview build must be checked before promotion; production
  deployment is an explicit release operation, not a database migration.
- Configure secrets independently for Preview and Production in the hosting
  provider. Never commit or paste values into tickets, logs, or this runbook.
  Use [`.env.example`](../../.env.example) as the variable inventory, but
  replace all local/test placeholders with per-environment values.
- Runtime essentials: `DATABASE_URL` (Postgres connection string),
  `AUTH_SECRET` (unique strong random secret), `AUTH_URL` (the exact canonical
  deployment origin), `AUTH_TRUST_HOST=true`, `EMAIL_SERVER`, and
  `EMAIL_FROM`. Configure the actual outbound SMTP provider and verify sender
  authorization before rollout. The test-only `TEST_DATABASE_URL` is not an
  app runtime setting.
- Hosted images require `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and
  `R2_SECRET_ACCESS_KEY`; keep the bucket private and scope its API token to
  that bucket. `STORAGE_DRIVER` defaults to `r2` when `R2_ACCOUNT_ID` is set;
  do not override it to `fs` in an ephemeral hosted runtime.
- `PLATFORM_BASE_DOMAIN` sets `{slug}.{base-domain}` tenant addresses. It may
  remain unset only in local development (where `*.localhost` is used).
  `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` are needed only for automated custom
  domain routing; use a project-scoped token and keep it server-side.
- Optional development/test settings: `TEST_DATABASE_URL`, `STORAGE_DIR`,
  `R2_ENDPOINT`, and `SIGNIN_RATE_LIMIT_SECRET`. `SIGNIN_RATE_LIMIT_SECRET`
  should be set only when deliberately independent rate-limit hashing is
  wanted; otherwise the app derives it from `AUTH_SECRET`.

### Release procedure

1. Confirm the exact revision and a clean, reviewed change set. Ensure CI has
   passed: `npm run check`, database migration against a fresh CI Postgres,
   `npm run test:run`, `npm run build`, perf budget, route smoke, and full
   Playwright E2E.
2. Confirm the target environment has all required variable **names** set;
   inspect values only in the provider dashboard. Check R2 read/write access
   with the upload/public-image flow. Never echo secret values.
3. Take/confirm a restorable database backup as in §3 before any schema
   migration. Verify the database provider, maintenance window, and rollback
   contact. These production backup details remain an open pilot gate until
   the provider's snapshot/PITR policy and a restore drill are documented.
4. Apply committed migrations with `npm run db:migrate` from the release
   artifact/revision, using the migration connection URL expected by the
   provider. This command runs against `DATABASE_URL`; confirm it points to
   the intended environment before invocation. Do not use `drizzle-kit push`,
   edit migration history by hand, or run an unreviewed SQL patch.
5. Deploy the app through the configured Vercel/Git integration. Verify the
   deployment corresponds to the approved revision and its build log has no
   unresolved failures. Do not report success from a build-start notification
   alone.
6. Run `npm run smoke -- <deployment-origin>` against that exact deployment.
   Check `GET /api/health` (expect 200 with database/storage healthy), then
   exercise login email delivery, owner dashboard, a disposable profile/menu
   save, publish/unpublish on a test tenant, public tenant hostname, and image
   upload/readback. Do not use a real customer tenant for destructive tests.
7. Confirm a fresh visitor context can retrieve the image. For a redeploy
   persistence check, upload to a disposable test tenant, record the object
   key and content hash (not the secret), complete a second deployment, then
   verify the same URL returns the same bytes. Delete the test tenant after.
8. Record revision, migration range, CI/E2E result, deployment URL, health and
   smoke outcomes, image-persistence result, operator, and timestamp in the
   release record. Redact all environment values and customer content.

### Before pilot data is accepted

- Identify the production Postgres provider and document automated backup,
  point-in-time recovery, retention, and restore procedure.
- Complete a restore rehearsal into a scratch/staging database and run the
  full E2E suite there.
- Confirm outbound email deliverability and sender policy, Vercel project and
  domain ownership, wildcard DNS/TLS, R2 access and lifecycle/retention, and
  an owner/operator support escalation contact.
- The above are readiness gates, not assertions that this checkout has a
  verified production deployment. Current local regression evidence is tracked
  in [the Phase 6.4 matrix](../plans/phase-6.4-regression-matrix.md).

## 2. Database migrations

Migrations are ordered, committed SQL under `db/migrations/` and tracked by
Drizzle's journal. Generate only from the schema workflow (`npm run db:generate`),
review the SQL and metadata diff, and test against a fresh database plus a copy
of representative existing data before release. Never rewrite a migration
already applied to a shared environment; add a forward migration instead.

### Apply and verify

```bash
# Local/dev database first
npm run db:migrate
npm run test:run
npm run build
npm run test:e2e
```

In hosted operations, confirm `DATABASE_URL` target and take a backup before
running `npm run db:migrate`. Capture command exit status and output in the
restricted release record; do not log connection strings. Afterwards verify
`GET /api/health`, the application smoke check, and the migration journal.
For an empty CI database, [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
shows the canonical ordering: migrate, DB tests, build, then browser tests.

Migrations should be additive and compatible with the currently serving app
where possible: add nullable/defaulted columns or tables first, deploy code
that can use them, backfill in a bounded/restartable job if required, and only
remove old structures in a later release after confirming no old app instance
uses them. Review lock duration and table rewrite risk for any large table;
this MVP's migration tool has no automatic online-migration planner.

## 3. Backup, restore, and rollback

### Backup gate

Before a schema change, take a provider snapshot with a recorded timestamp and
retention/restore point. If provider snapshots are unavailable or unverified,
take a `pg_dump` from a consistent source using a secure destination, restrict
file permissions, and verify the resulting file is non-empty/readable. Keep
backup artifacts out of Git and ordinary logs. Existing
[ops-reliability guidance](ops-reliability.md#database-backup-and-restore)
records the Phase 6.5 restore rehearsal (2026-10-18): production `pg_dump`
verified restorable into the disposable preview project with the full suite
green on the restored copy, and Decision 1 taken as weekly `pg_dump` to R2
(last 4 dumps, secret `BACKUP_DATABASE_URL`). Until that Action exists and
has run green, keep taking a manual `pg_dump` before every production
migration.

### Application rollback

- For an application-only regression with a backward-compatible schema,
  redeploy the last known-good Vercel revision and rerun smoke, health, and
  critical journey checks.
- Do not assume reverting application code reverses a database migration.
  Prefer forward-compatible migrations. If old code cannot run safely on the
  new schema, stop rollout and use the documented restore/forward-fix choice
  with the database operator; never improvise destructive SQL during an
  incident.
- Vercel deployment rollback does not restore Postgres or R2. Database and
  image objects are separate durable state; coordinate their recovery and
  verify tenant image links after a data restore.
- A data restore may discard writes made after the backup. Confirm impact and
  obtain explicit operator/customer approval before restoring. Preserve a
  forensic copy of the affected database where incident policy permits.
- Do not reset production, drop/recreate a database, delete an R2 bucket, or
  run `docker compose down -v` outside local disposable development. Such
  destructive operations require explicit authorization and a verified
  recovery point.

### Rollback decision record

Record the symptom, affected environment/tenants, last good revision, current
migration journal, backup identifier/time, data-loss window, chosen path
(application redeploy, forward fix, or restore), approver, operator, and
post-recovery verification. Avoid adding personal data or tokens to the record.

## 4. Operator onboarding: create and configure a tenant

1. Sign into the staff account and open `/operator`.
2. Create the restaurant at `/operator/tenants/new`: choose a unique
   lowercase slug, display name, theme, and leave it unpublished unless there
   is an approved reason to launch it immediately.
3. Open its operator detail page and grant access to the customer's correct
   email. Inviting an owner creates only the default owner account; it does
   not send a magic link. Ask the owner to request one from `/login` and verify
   they can enter the assigned dashboard.
4. The owner configures profile, hours, categories/items, images, and theme;
   use Preview to inspect draft content. The operator checklist shows gaps;
   do not claim completion from a saved profile alone.
5. Confirm the owner has reviewed the public content and explicitly approves
   publish. Check the platform hostname `{slug}.{PLATFORM_BASE_DOMAIN}` from a
   signed-out visitor context, and verify the public view contains only that
   tenant's published/available content.
6. Custom domain is optional. Follow [custom-domains](custom-domains.md):
   record claim → customer publishes the TXT record → check verification →
   check provider routing and HTTPS. `verified` means DNS ownership only;
   call a custom domain live only after routing and HTTPS both answer. Keep
   the platform hostname as the fallback.
7. Record onboarding date, tenant slug, assigned owner email (in the approved
   customer system), publication approval, and domain state. Never record
   sign-in links, session tokens, or DNS verification tokens in support notes.

## 5. Support intake and triage

### Customer report

Ask for: tenant slug or public hostname, affected screen/action, approximate
UTC time, expected vs actual outcome, whether other users/devices reproduce
it, and a screenshot with contact details/token values redacted. Ask whether
the site is published and whether the issue is public visitor, owner dashboard,
email sign-in, image, or domain related. Do not ask for a password (there is
none), a magic link, session cookie, API key, database URL, or unredacted
customer/visitor data.

Assign a case/reference number and severity, acknowledge receipt, tell the
customer what is known and when the next update will arrive. Keep a concise
chronology and the customer's impact. Do not promise a fix/time until the
operator confirms it.

### Initial checks

1. Check `GET /api/health`. A 503 means database or storage degraded; inspect
   redacted Vercel function logs around the UTC timestamp and follow
   [ops-reliability](ops-reliability.md). Never send raw logs to the customer.
2. Run `npm run smoke -- <deployment-origin>` to distinguish route-gate or
   public path regressions. Preserve its exit code/output in the case.
3. Check the deployed revision/build logs and the recent migration record.
   If a failure began immediately after a release, follow §3 application
   rollback policy; do not reverse schema changes blindly.
4. For sign-in, check rate-limit response and SMTP provider delivery status;
   ask the user to retry after the displayed wait. Do not generate or forward
   an auth link on their behalf.
5. For missing images, verify the image URL belongs to the tenant, check R2
   health/configuration and object presence, and use the owner's editor to
   re-upload only with their consent. Never make the bucket public to debug.
6. For domains, inspect the exact claim/routing state and use
   [domain-lifecycle](domain-lifecycle.md) triage. Do not hand-edit claim
   rows or say verified means live.
7. Reproduce with a disposable tenant where possible. Preserve evidence before
   modifying state. Escalate suspected cross-tenant exposure, credential
   leakage, or data loss immediately to the security/operations owner.

### Severity and closure

- **Critical:** suspected cross-tenant data access, credential exposure, or
  broad outage/data loss. Restrict further impact, notify the operations and
  security owner immediately, preserve redacted evidence, and keep affected
  customers updated through the approved contact channel.
- **High:** one tenant cannot publish/sign in/manage content, or custom-domain
  routing is broken while the platform hostname works. Acknowledge promptly,
  gather the facts above, and escalate to the on-call/operator owner.
- **Normal:** isolated content correction, cosmetic issue, or non-blocking
  question. Track expected next action and update the requester.

Before closing, verify the fix on the affected public/owner path, confirm no
neighboring tenant regressed, record the root cause and preventive action,
and tell the customer what changed without disclosing internal secrets or
another tenant's information. If unverified, say so and leave the case open.

## 6. Pilot readiness gaps to resolve

- Production database provider and backup/PITR/restore rehearsal are not
  identified in the current runbook; resolve before storing real customer data.
- Production domain/base-domain choice and Vercel production/Preview release
  evidence must be recorded; local E2E is not deployment verification.
- Confirm the authorized operations/support contact, coverage hours, customer
  communications channel, and security incident escalation owner.
- Confirm deployment permissions, owner approval process for initial publish,
  and data-retention/deletion handling with the product operator.
