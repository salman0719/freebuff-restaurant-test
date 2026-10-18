# Phase 6.5 execution plan

**Audience:** one Buffy session + one human availability window.
**Goal:** close the last regression matrix exit rule (production backed up, restored, migrated, current build live, email verified) so we can flip ROADMAP 6.5 to Done.

**Result (2026-10-18/19): all phases ran green.** Phase A: production
`pg_dump` (322,405 bytes) restored into the disposable preview project
with the full suite green on the restored copy; Decision 1 = (a) weekly
`pg_dump` to R2 (last 4). Phase B: production migrated and live on
`easyeatery.online` at `7121907` (health + smoke green). Phase C: email
DNS verified via Resend (DKIM + CNAME delegation + DMARC `p=none`),
magic-link receipt test passed in seconds, backup Action first green run
(`prod-backup-2026-10-18.dump`, 322,405 bytes, 0 deleted), escalation
contact recorded provisional. Detail in the
[pilot runbook](../runbooks/pilot-deployment-support.md).

## Inputs you need to provide before Phase A starts

1. **`local/.prod-db-url`** — a single line, the production Postgres `DATABASE_URL`. Git-ignored pattern; Buffy percent-encodes the password itself, no raw password pastes into chat. Alternative: you run the dump yourself and hand Buffy a clean `.dump` file — then skip A0–A1.
2. **Confirmation** that the **preview** Supabase project may be wiped for the restore rehearsal (Phase A3). It is disposable by design; this is the "may I drop its public schema" gate.
3. **Decision 1 — backups strategy (before Phase A finishes):**
   - **(a)** weekly `pg_dump` GitHub Action pushing to R2 (~45 min extra, needs one repo secret you paste: `BACKUP_DATABASE_URL`). Recommended for a pilot.
   - **(b)** upgrade the Supabase free-tier project to Pro (~$25/mo, daily backups + PITR). Revisit when the pilot is paid.
   - Whichever you pick, Supabase free tier has **no backups and no PITR** — that is a hard reason not to call 6.5 Done without the restore rehearsal, not just a doc gap.
4. **Go/no-go + time window for the production deploy (before Phase B).** Phase B migrates the production database — it is deliberately sequenced _after_ Phase A so a restore exists first. Do not flip this go without that.
5. **SMTP provider name** for the sending domain, best-effort. The DNS checks (Phase C2) work without it, but tell me the provider so I can sanity-check alignment rather than guess. Plus one sign-in receipt test on production (you have the inbox; I do not).
6. **Escalation contact** — name + email for the pilot runbook.
7. **R2 retention preference** for the backup blob (Phase C3) — e.g. keep the last 4 weekly dumps, or 8, or a fixed byte budget. Affects the GitHub Action retention config I write.

## Phase A — Backup & restore rehearsal

**Buffer:** ~1–1.5 h of Buffy time, depending on dump size and suite runtime.

| Step | Action                                      | Command (working dir = repo root)                                                                                                                                                                                                                                               | Time box                       |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| A0   | Encode + verify connection                  | Buffy script: read `local/.prod-db-url`, percent-encode the password, write `local/.prod-db-url-encoded`; then `psql` one-shot `SELECT count(*) FROM information_schema.tables` to prove it reaches production read-only. Fails loudly if the URL is bad.                       | 5 min                          |
| A1   | Dump production                             | `docker run --rm -v "$PWD/local:/out" postgres:17-alpine pg_dump --no-owner --no-privileges "$(cat local/.prod-db-url-encoded)" -Fc -f /out/prod-backup-$(date +%F).dump`                                                                                                       | 5–15 min (scales with DB size) |
| A2   | Verify dump                                 | `stat -c %s local/prod-backup-*.dump` → must be > 0, plus `pg_restore -l local/prod-backup-*.dump` lists tables and partitions. Record dump size and table count.                                                                                                               | 5 min                          |
| A3   | Wipe + restore into **preview** project     | Buffy uses the preview project's encoded URL (from prior work). Against that disposable DB only: `psql` `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` then `pg_restore -d "$PREVIEW_DB" local/prod-backup-*.dump`. **Never against production.** Record restore duration. | 15–30 min                      |
| A4   | Migration path from production's data shape | `DATABASE_URL=$(cat local/.preview-db-url-encoded) npm run db:migrate` — must pass. Proves the migrations the production build missed are forward-safe on real production data.                                                                                                 | 5 min                          |
| A5   | Full suite against the restored copy        | Export `DATABASE_URL` and `TEST_DATABASE_URL` to the **preview** URL; keep Mailpit up. `npm run test:run` + `npm run build` + `npm run test:e2e`. Diff any failures against the known-good local results; production data may expose shape issues local fixtures don't.         | 20–30 min                      |
| A6   | Record                                      | Write the restore duration, dump size, table count, and what passed into `docs/runbooks/ops-reliability.md` "Production backup" section and into the pilot runbook.                                                                                                             | 10 min                         |

After A6, record Decision 1 in the same docs (option chosen + secret name if (a), or "defer to Pro revisit" if (b)).

## Phase B — Production on current code

**Buffer:** ~1.5–2 h of Buffy time. Sequenced after Phase A on purpose.

| Step | Action                                | Command                                                                                                                                                                                                                                                                                                                                      | Time box                                                              |
| ---- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| B1   | Pre-migrate backup                    | Same `pg_dump` as A1 into `local/prod-backup-predeploy-$(date +%F).dump`. Runbook rule: `pg_dump` before every production migration.                                                                                                                                                                                                         | 5–15 min                                                              |
| B2   | Migrate production                    | `DATABASE_URL=$(cat local/.prod-db-url-encoded) npm run db:migrate`                                                                                                                                                                                                                                                                          | 5 min (plus any migration runtime)                                    |
| B3   | Deploy current build                  | `npx vercel deploy --prod --yes` from `phase6`. The project is CLI-deployed, not Git-linked, so this is the path, not a push-to-Git trigger.                                                                                                                                                                                                 | 5–10 min build                                                        |
| B4   | Verify health                         | `GET https://easyeatery.online/api/health` → must be `200 { db: "ok", storage: "ok" }`. If it returns 404, production is still on the old build (our current state) — that is the reason for this phase. If it returns 500 with the raw-password class of error, apply the fix path recorded in the audit doc and re-test before continuing. | 5 min                                                                 |
| B5   | Run the live-environment smoke script | `npm run smoke -- https://easyeatery.online` — same script already used against the preview environment. Confirms public-site reachability and the theme/branding surfaces in real hosting, not just local dev.                                                                                                                              | 5–10 min                                                              |
| B6   | DNS + wildcard domain                 | Confirm `*.easyeatery.online` resolves and serves TLS on the tenant subdomains used by the E2E suite. Buffy can verify the cert chain and resolution itself; only escalate to registrar settings if something looks off.                                                                                                                     | 15–30 min, mostly waiting on propagation if anything is due to change |

After B6, record the production deploy revision and health result in the pilot runbook.

## Phase C — Email records, escalation contact, retention, close-out

**Buffer:** ~45 min of Buffy time, but Step C2 needs a one-time receipt test from you.

| Step | Action                                  | Time box                                                                                                                                                                                                                              |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1   | DNS email checks for the sending domain | `TXT` for SPF, any `DKIM` `selector._domainkey` records, and any `DMARC` `._dmarc` record. Record what is present and whether alignment looks okay for the provider named in Input 5.                                                 | 20–30 min     |
| C2   | One sign-in receipt test on production  | You trigger a magic-link sign-in on `easyeatery.online/login`, confirm the email arrives and the link logs in. Buffy does the DNS work above; you own the inbox.                                                                      | Yours; ~5 min |
| C3   | R2 retention config for backups         | If Decision 1 = (a), write the backup GitHub Action with the retention you named in Input 7 and the secret you paste (`BACKUP_DATABASE_URL`).                                                                                         | 10–15 min     |
| C4   | Escalation contact                      | Drop name + email into the pilot runbook.                                                                                                                                                                                             | 2 min         |
| C5   | Close-out record                        | Update `docs/runbooks/pilot-deployment-support.md`, `docs/plans/phase-6.5-execution-plan.md` (this file) with the actual results, and flip ROADMAP 6.5 to Done with the same kind of close-out line used for 6.4. Commit on `phase6`. | 10 min        |

## What each phase needs from you, in order

1. Before **A0**: `local/.prod-db-url` + preview-wipe confirmation.
2. Before **A6 ends**: Decision 1 (a or b), and if (a) the repo secret value for `BACKUP_DATABASE_URL`.
3. Before **B** starts: go/no-go + a time window for the production deploy.
4. Before **C2**: SMTP provider name (best-effort) + one sign-in receipt test on production.
5. Before **C5**: escalation contact + R2 retention preference (if (a)).

## What is NOT in scope for 6.5

- Migrating the production database to a different provider.
- A full DR drill beyond one restore-and-migrate rehearsal.
- Removing Turbopack/Postgres error-tracing noise — that is a separate tech-debt item already recorded.

## "I want less than this"

If the backup decision is (b) or you'd rather not do the restore rehearsal now, the honest fallback is to record 6.5 as **blocked on a hosting decision** rather than Done — the runbook forbids calling it closed with no restore proof. That is not a failure; it is the matrix being honest about what "production backed up and restorable" actually requires.
