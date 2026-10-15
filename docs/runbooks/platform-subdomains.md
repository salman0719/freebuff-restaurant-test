# Platform subdomains (Phase 5.1)

Canonical format: `{slug}.{PLATFORM_BASE_DOMAIN}`. The support view of
every address state (platform, claimed, verified, live) and what to tell
a customer: [domain-lifecycle.md](domain-lifecycle.md).

- `PLATFORM_BASE_DOMAIN` unset means `localhost`, so
  `marios-pizza.localhost:4030` resolves slug `marios-pizza`.
  `*.localhost` resolves to `127.0.0.1` with no DNS setup.
- Production example: with `PLATFORM_BASE_DOMAIN=platform.example`,
  `marios-pizza.platform.example` resolves slug `marios-pizza`.
- Resolution order (see `src/lib/tenant-resolution.ts`, decision `0003`):
  1. exact `custom_domain` match wins,
  2. else single-level `{slug}` subdomain of the base domain,
  3. else not-found — never another tenant.
- Reserved slugs (`www`, `api`, `app`, `admin`) address the platform,
  never a tenant. Nested subdomains (`a.b.platform.example`), the apex
  (`platform.example`), unknown slugs, and malformed hosts all 404.

## Local verification

```bash
npm run dev
# then open http://marios-pizza.localhost:4030 (seed with `npm run db:seed`)
curl -H "Host: marios-pizza.localhost:4030" -I http://localhost:4030/
curl -H "Host: ghost.localhost:4030" -I http://localhost:4030/   # 404
curl -H "Host: www.localhost:4030" -I http://localhost:4030/     # 404 (reserved)
```

Pure hostname edge cases live in `src/lib/tenant-host.test.ts`;
live resolution (subdomain, custom-domain precedence, unknown/reserved/
nested/malformed) runs against Postgres in
`src/lib/tenant-resolution.test.ts` with `TEST_DATABASE_URL` set.

## Production setup (Vercel, per decision `0002` §6)

1. Choose the base domain (e.g. `platform.example`).
2. DNS: wildcard record `*.platform.example` → the deployment
   (Vercel: add `*.platform.example` as a project domain and follow its
   DNS instructions; Vercel supports wildcard domains even on Hobby).
3. App env: set `PLATFORM_BASE_DOMAIN` to the base domain.
4. TLS: Vercel auto-issues and renews certificates, including the
   wildcard. Do not claim a hostname is live until routing AND HTTPS
   both work (the same rule 5.3 applies to custom domains).

## Limitations

- No hosted base domain is configured yet — production setup waits on
  the operator choosing the domain and granting DNS / Vercel access.
- Vercel Hobby caps **custom** domains at 50 (a 5.2 concern); the
  wildcard itself is covered by the platform domain, not per-tenant
  custom domains.
- Apex vs `www` are separate records; only the wildcard + apex records
  you actually create will route.
- No hostname→tenant cache in the MVP by decision: correctness first,
  and any future cache must invalidate on publish/slug/domain changes
  and never cache personalised output across tenants.
- Unpublished tenants resolve to an identity but render 404 — visibility
  is the public data service's job, not the resolver's.
