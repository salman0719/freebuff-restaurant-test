# Product scope — MVP (draft, needs owner confirmation)

Derived from `ROADMAP.md` Phase 0.2. Status: confirmed by owner
2026-10-12 — binding for Phase 1 implementation.

## MVP user journeys and acceptance criteria

1. **Visitor browses a restaurant website and its menu.**
   - Given a published restaurant on its assigned host, the public site
     renders name, menu categories/items, hours, contact, and location.
   - Only published content is visible; unknown tenants show a safe
     not-found state.

2. **Owner signs in and edits restaurant details or a menu item.**
   - Only an authenticated owner of that tenant can load the editor and
     save changes; other tenants' data is unreachable.

3. **Owner previews changes and publishes them.**
   - Draft edits are visible in a private preview; the public site is
     unchanged until publish succeeds, and publish failures are reported
     (never silent success).

4. **Operator creates a restaurant and assigns an owner.**
   - Operator-only action: new tenant with default theme and safe default
     content; duplicate/invalid tenant identifiers are rejected.

5. **Visitor reaches a restaurant through its assigned host/domain.**
   - The hostname resolves to exactly one tenant; unknown or ambiguous
     hosts never leak another tenant's content.

## Explicitly out of scope for the MVP

Ordering, **reservations (confirmed post-MVP, see Phase 8)**, payments,
and POS/delivery integrations. Also deferred: menu import, QR-code pages,
analytics, SEO structured data, special/holiday hours, i18n, extra themes.

## Sign-off decisions (owner, 2026-10-12)

- 5 journeys approved as written; out-of-scope list approved as written.
- Two public themes in MVP (café + takeaway).
- Platform subdomains only; custom-domain onboarding deferred.
- Menu item and logo images included in MVP.
- Owner sign-in via email magic link / invite (no passwords).

## Notes

- Target customers: independent restaurants, cafés, takeaway shops.
- Keep the MVP data model free of reservations/ordering concepts so the
  later phase can design them cleanly.
