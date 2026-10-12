# 0002 — Open decisions blocking Phase 1 (status: open)

Decide each before the implementation milestone; prefer reversible,
simple options. Do not add infrastructure the MVP does not need.

1. **Database + migrations.** Roadmap suggests PostgreSQL + Drizzle.
   Decide provider (local Docker vs hosted), ORM, and migration workflow.
2. **Authentication + roles.** Operator vs owner model; no custom
   password/session system. Pick a provider/integration.
3. **Tenant identification.** Subdomain/host mapping for dev and
   production; server-side tenant context pattern.
4. **Test setup.** No runner yet (`npm test` missing). Pick unit +
   route/integration approach and wire the script into quality gates.
5. **Image/file storage.** Needed for Phase 3.6; choose provider and
   upload contract early enough to shape the schema.
6. **Deployment + domains.** Target host, preview environments, and how
   platform subdomains/custom domains map to tenants.
7. **CI.** Add a workflow running `npm run check` (+ tests once they
   exist) when the hosting setup makes it practical.
