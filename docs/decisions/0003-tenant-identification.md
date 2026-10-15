# 0003 — Tenant identification (approved by owner 2026-10-12)

## Model

`tenants` table: server-generated `id` (uuid, internal, never exposed to
clients as an authority claim), human `slug` (unique, URL-safe, e.g.
`marios-pizza`, assigned by the operator at creation), nullable unique
`custom_domain`, plus status fields (`published`, etc.).

Ownership lives in a `memberships` table (`user_id`, `tenant_id`, role);
an `owner` role alone never implies access to a specific tenant.

## Resolution (`proxy.ts`, runs before routes render)

1. Normalise the hostname (lowercase, strip port).
2. Exact match on `custom_domain` → tenant.
3. Else `{slug}.platform.example` subdomain → tenant by slug.
4. Else safe 404 — never fall through to another tenant.

**Update 2026-10-15 (Phase 5.2):** step 2 now requires the claim to be
VERIFIED — the row carries `custom_domain_status` ('none' / 'pending' /
'verified') and resolves only at 'verified', which is granted only
after the owner's TXT token is seen at
`_restaurant-platform.<domain>`. Rationale: an unverified `custom_domain`
row is just a claim, and a claim must never be enough to serve a
tenant on an arbitrary hostname. Owner flow and guarantees:
`docs/runbooks/custom-domains.md`. Routing/HTTPS (5.3) is still what
makes a verified domain reachable in practice. 5. Overwrite (never trust) any client-sent tenant header; rewrite to an
internal tenant route and enforce membership again in the data layer.

## Rules

- Slugs are effectively immutable (renames break URLs/incoming links);
  changing one later needs redirects, so get it right at creation.
- Cache the hostname→tenant map where safe; never cache personalised
  output across tenants.
- Reserve slugs (`www`, `api`, `app`, `admin`) and validate the format at
  creation to reject duplicates and junk.
- Single shared database with `tenant_id` FKs everywhere; PostgreSQL
  row-level security is a possible later defence-in-depth layer, not a
  substitute for server-side checks.
