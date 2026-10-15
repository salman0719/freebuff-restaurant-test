# Domain lifecycle (Phase 5.4)

Support-facing map of every state a restaurant's public address can be
in, how it moves between them, and what to tell the customer. The
step-by-step mechanics live in the two sibling runbooks —
[custom-domains.md](custom-domains.md) (the claim and its DNS records)
and [platform-subdomains.md](platform-subdomains.md) (the base domain
and its wildcard). This page is the one to read when a customer says
"my domain is broken".

## Every restaurant has two addresses

- **Platform address** — `{slug}.{PLATFORM_BASE_DOMAIN}`, created with
  the restaurant and never removed. It is the answer whenever a custom
  domain is misbehaving, and the only address a restaurant has until an
  owner connects one.
- **Custom domain** — optional, owner-connected, and the only address
  that can move between restaurants (by release, never by takeover).

## Custom-domain states

The stored state is exact; the customer's experience of it is what
support should describe.

| State                  | Stored as                       | Visitors on the custom domain get      | What it means                                                            | What moves it forward                        |
| ---------------------- | ------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| Not connected          | `custom_domain_status = 'none'` | (domain is not involved)               | No claim. Only the platform address exists.                              | Owner records a domain                       |
| Recorded, not verified | `pending`                       | 404 — the hostname serves no tenant    | A claim only. The TXT token has not been seen, so ownership is unproven. | Owner publishes the TXT record, then Checks  |
| Verified               | `verified`                      | The restaurant's site (once published) | The TXT token was seen: the claim is proven. Routing/HTTPS are separate. | Routing (see below), automatically connected |

`verified` is about **ownership**, never about liveness — the same line
the operator onboarding checklist draws when it reports a domain as
RECORDED. Say "we've confirmed you own it", not "it's live".

## Routing states (after verification)

Nothing stores these; the platform folds three facts each time it is
asked (`src/lib/domain-routing.ts`): the domain is attached to the
platform project, the hosting provider has validated its DNS, and an
HTTPS probe of the hostname actually completes.

| State      | Facts that hold                                  | Visitors get                          | What to tell the customer                                                                                         |
| ---------- | ------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `detached` | not attached to the project                      | Nothing (or a hosting-provider page)  | "Not connected to our platform yet." Re-checking after verification connects it automatically.                    |
| `pending`  | attached, but DNS not validated, or no HTTPS yet | Nothing yet, or a certificate warning | "Connected — the last automatic step is finishing." DNS validation clears in minutes; certificates shortly after. |
| `live`     | attached **and** validated **and** HTTPS answers | The restaurant's site over HTTPS      | "Live." Only this combination may be called live.                                                                 |

## Rules that hold in every state

- **One hostname, one restaurant.** A domain another restaurant holds —
  pending or verified — is refused with a field-level conflict message,
  and the refused restaurant is left with no claim of its own.
- **Reassignment is release + proof, never takeover.** Only the current
  holder can release a domain (removing it in the dashboard), and the
  next claimant still has to publish and pass the TXT check before the
  hostname serves them.
- **Switching the domain frees the old hostname immediately.** A stale
  verified row would be a live alias, so the old domain stops resolving
  the moment the change is saved.
- **Removal clears domain, state, and token together**, and the
  restaurant keeps its platform address.
- **The resolver honors verified rows only** (`src/lib/tenant-resolution.ts`),
  so a claim that has not passed the TXT check can never serve a tenant.
- **A verified claim survives a routing failure.** The claim records
  ownership; a failed attach is a separate, stated problem — and a
  retried verification succeeds rather than reporting a false failure.

## Reassignment procedure

The customer moved a domain from one restaurant (or one of their own
accounts) to another:

1. The **current** holder removes the domain in
   `/dashboard/{slug}/domain` (two-step confirm: "Remove domain…" then
   "Confirm removal").
2. Check the old hostname no longer serves the first restaurant; its
   platform address still does.
3. If the removal reported a failed detach, retry it (or remove the
   domain from the hosting project's domain list). The hostname stopped
   serving either way — detaching is bookkeeping, not the boundary.
4. The **new** owner records the same domain and publishes the TXT
   record the dashboard shows at
   `_restaurant-platform.<domain>`. Tokens are generated per claim and
   never reused, so the old owner's leftover TXT record cannot verify
   anything — remove it as hygiene, not as a fix.
5. Check the claim, then check the routing status once DNS propagates.

## Triage

| Symptom                                                      | What it actually means                                                                             | What to do                                                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| "I published the TXT record but Check now says not seen yet" | DNS propagation, or the record name/value differs from the dashboard's                             | Re-read the name in the dashboard (`_restaurant-platform.<domain>`, or the relative label some panels want); wait minutes; retry. |
| "Check now says it could not query the domain's DNS"         | The platform's resolver could not answer — **not** a wrong record                                  | Retry, or test from another network. Nothing is wrong with the customer's DNS.                                                    |
| "It's verified but the site isn't there"                     | Routing has not finished (attach, DNS validation, or the certificate)                              | Check the routing status; then the hosting project's domain list. Never describe it as live.                                      |
| "Stuck waiting for DNS validation"                           | The registrar's nameservers do not point at the hosting provider yet                               | Move the nameservers, or add the `_acme-challenge` delegation from the subdomains runbook.                                        |
| "Attach refused — already assigned to another project"       | The domain sits on someone else's hosting project                                                  | Remove it there (or complete the provider's ownership challenge), then re-check routing.                                          |
| "Validated, but HTTPS pending for a long time"               | The certificate's DNS-01 challenge is waiting on propagation (nameserver changes can take 24–48 h) | Confirm the `_acme-challenge` delegation exists; keep checking. Nothing to re-enable.                                             |
| "Removal said the detach failed"                             | The domain already stopped serving (the resolver ignores it); only the provider cleanup failed     | Retry the removal, or detach it in the hosting project's domain list.                                                             |
| "Another restaurant says the domain is theirs"               | One of them holds the verified claim — the other is refused a takeover                             | Confirm which restaurant holds it, then follow **Reassignment** above. Staff must not move it.                                    |

## What support must not do

- **Never move or add a domain by editing data.** Only the claim flow
  writes these columns; a hand-edited `verified` row would serve a
  hostname whose ownership nobody proved.
- **Never call a domain live from `verified` alone.** Live needs
  routing and HTTPS (see the table above).
- **Never paste a verification token into a ticket or chat** unless the
  customer explicitly asks for the value shown in their own dashboard —
  it exists only to prove they control the domain.
- **Never detach a domain for a customer without their confirmation**;
  a detach is what takes their site down.
- The operator console reports a custom domain as RECORDED, never as
  live, and that is deliberate — do not read it as a status page.

## Where this is verified (5.4 coverage map)

| 5.4 item                            | Pinned by                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid platform hostname             | `src/lib/tenant-host.test.ts` (pure), `src/lib/tenant-resolution.test.ts` (live), `domain-lifecycle-live.test.ts`                                           |
| Valid verified custom domain        | `src/lib/tenant-resolution.test.ts`, `src/lib/domain-claim-live.test.ts`, `domain-lifecycle-live.test.ts`                                                   |
| Unknown hostname                    | `src/lib/tenant-resolution.test.ts`                                                                                                                         |
| Unverified domain                   | `src/lib/tenant-resolution.test.ts`, `src/lib/domain-claim-live.test.ts`, `domain-lifecycle-live.test.ts`                                                   |
| Duplicate domain claim              | `src/lib/domain-claim-live.test.ts`, `domain-lifecycle-live.test.ts`, `e2e/domain-claim.spec.ts`                                                            |
| Domain removal or reassignment      | `src/lib/domain-lifecycle-live.test.ts` (release → reclaim → re-prove, and switching a verified claim), `e2e/domain-claim.spec.ts` (removal in the browser) |
| Failed or pending domain activation | `src/lib/domain-routing.test.ts` (the whole truth table), `domain-lifecycle-live.test.ts` (a failed attach against a real claim; never live)                |

The lifecycle suite is live-gated on `TEST_DATABASE_URL` like the other
live suites; DNS and the hosting project are injected, so it never
depends on the network:

```bash
docker compose up -d && npm run db:migrate
TEST_DATABASE_URL=postgresql://app:secret@localhost:4432/restaurant_app \
  npx vitest run src/lib/domain-lifecycle-live.test.ts
```

## Related

- [custom-domains.md](custom-domains.md) — the claim flow, DNS
  instructions, and manual recovery for common DNS errors.
- [platform-subdomains.md](platform-subdomains.md) — the canonical
  platform address format and the production wildcard setup.
- `docs/decisions/0003-tenant-identification.md` — resolution order
  (verified custom domain first, then platform subdomain, then
  not-found).
