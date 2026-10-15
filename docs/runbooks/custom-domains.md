# Custom domains (Phase 5.2)

A restaurant's owner connects a domain they own from
`/dashboard/{slug}/domain`. Verification is DNS-based and proves
ownership; it does NOT make the address live (routing + HTTPS are
Phase 5.3 — see the roadmap).

## Owner flow

1. **Record the domain** (e.g. `shop.example.com`) — the platform stores
   it as a _pending claim_ with a one-time TXT token. The domain serves
   nothing at this point; the hostname resolver ignores it.
2. **Publish the TXT record** at the restaurant's DNS provider:

   | Type | Name                                    | Value                              |
   | ---- | --------------------------------------- | ---------------------------------- |
   | TXT  | `_restaurant-platform.shop.example.com` | (the token shown in the dashboard) |

   Some DNS panels want the relative name (`_restaurant-platform`);
   either form is the same record.

3. **Check now** — the platform queries the TXT record. A match flips
   the claim to _verified_; "not seen yet" means DNS has not propagated
   (minutes, occasionally longer). "Could not query DNS" means the
   lookup itself failed (some networks/resolvers refuse TXT queries) —
   it never means the record was wrong.
4. **Switching domains** restarts verification with a fresh token; the
   old domain stops being claimed. **Removal** (two-step confirm)
   clears domain, state, and token together. The platform address
   (`{slug}.<base domain>`) keeps working throughout.

## What "verified" means here

Verified = the TXT token was seen = the submitter controls the domain's
DNS. It does NOT mean visitors are sent to the site yet: routing and
HTTPS for a tenant's custom domain arrive with Phase 5.3. The operator
onboarding checklist therefore reports a domain as RECORDED even after
verification, and the dashboard says the same thing in its own words.

## Routing and HTTPS (Phase 5.3)

Verification proves ownership; routing is what serves the domain. The
platform drives Vercel's project-domain API (`src/lib/vercel.ts`):

- **Verifying a claim attaches the domain** to the project
  automatically (already-attached counts as success, so retried
  verifies never re-report failure).
- **Removing a claim detaches it** (best-effort — the hostname resolver
  stops honoring the domain the moment the claim is gone, so a failed
  detach is stated, never blocking).
- **Check routing status** (dashboard, verified claims) folds three
  facts into one state: attached to the project, Vercel-validated DNS
  (`verified`), and a real HTTPS probe. Only all three together say
  **live** — the API exposes no certificate status, so the probe is the
  only honest TLS signal.

States: `detached` (not connected), `pending` (waiting on DNS
validation, or on the certificate after validation), `live` (answers
over HTTPS). Vercel issues and renews Let's Encrypt certificates
automatically via DNS-01 once DNS points at it.

Configuration (server-side only, never committed):
`VERCEL_TOKEN` (project-scoped access token) + `VERCEL_PROJECT_ID` in
`.env.local`. Without them every routing operation fails closed with a
"not configured" message; claims, verification, and resolution all
still work — routing is additive.

## Guarantees (enforced, not conventions)

- The hostname resolver honors a `custom_domain` row **only** when
  `custom_domain_status = 'verified'` (`src/lib/tenant-resolution.ts`),
  so an unverified claim can never serve a tenant.
- One domain can address at most one restaurant: the unique index
  refuses a second claimant, reported as a field-keyed conflict.
- Claim, state, and token move together via schema CHECKs
  (`tenants_custom_domain_claim_present`, `…_token_present`); writes go
  only through `src/lib/domain-claim.ts` (the generic settings update
  deliberately cannot set a domain).

## Manual recovery — common DNS errors

- **Stuck "waiting for DNS validation"** — the domain's registrar is
  not pointing at Vercel yet. Either move the nameservers to
  `ns1/ns2.vercel-dns.com`, or (keeping your DNS host) add the
  `_acme-challenge` NS delegation + wildcard CNAME from the platform
  subdomains runbook. Validation retries automatically.
- **Attach refused: "already assigned to another Vercel project"**
  (CONFLICT) — the domain sits on someone else's project (possibly an
  old one of yours). Remove it there (Project → Settings → Domains),
  then re-check routing; or complete Vercel's verification challenge,
  which proves ownership for your account.
- **Verification check says "could not query DNS"** — the platform's
  resolver could not answer the TXT lookup (some networks refuse TXT
  queries; CI and most servers are fine). Nothing is wrong with the
  record; retry, or check from another network.
- **Validated but HTTPS pending for a long time** — the certificate's
  DNS-01 challenge is waiting on propagation; nameserver changes can
  take 24–48 h. Confirm `_acme-challenge` delegation exists.
- **Removal reported a failed detach** — the domain no longer serves
  the restaurant either way (the resolver ignores it). Retry by
  removing it in the Vercel dashboard (Project → Settings → Domains),
  or re-run removal.

## Verification

- `src/lib/domain-claim.test.ts` — pure matcher/mapping/validation.
- `src/lib/domain-claim-live.test.ts` — real database: conflict,
  pending-does-not-resolve, the verified flip unlocking the hostname,
  DNS short-circuit, context scoping, idempotent removal (opt-in via
  `TEST_DATABASE_URL`).
- `e2e/domain-claim.spec.ts` — the browser journey with a disposable
  fixture; the check hits real DNS and pins "never verified without the
  record" rather than one resolver's failure wording.
