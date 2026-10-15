# Product Roadmap: Multi-Tenant Restaurant Website Platform

## Purpose

This document defines the implementation roadmap for the restaurant
website platform. It is intended to be used alongside `AGENTS.md`
(standing agent rules).

The goal is to ship a focused, reliable MVP for independent restaurants,
cafés, and takeaway shops. Each customer gets a public website and an
owner dashboard. The platform operator can onboard and configure
restaurants.

This roadmap is a plan, not permission to build every phase at once.
Work phase by phase, keep tasks bounded, and verify each milestone
before moving forward.

## How to use this roadmap

For every phase:

1.  Check the current repository and completed work before starting.
2.  Turn the relevant subphases into small tasks with explicit
    acceptance criteria.
3.  Identify dependencies and shared interfaces before assigning tasks
    to separate agents.
4.  Keep the canonical implementation in the main Git repository.
5.  Run the relevant tests and checks before marking a subphase
    complete.
6.  Update this roadmap with status, decisions, blockers, and
    verification results.

Suggested status values: `Not started`, `Ready`, `In progress`,
`Blocked`, `Done`.

Do not mark a task done based only on code generation. It must meet its
acceptance criteria and have an honest verification report.

---

# Phase 0: Repository audit and product decisions

**Goal:** Understand what already exists and agree on the smallest
viable architecture before building.

**Exit criteria:** The repository has a documented current state, major
decisions are recorded, and the first implementation tasks are ready.

## 0.1 Repository and tooling audit

**Status:** Done (see `docs/audit.md`; all commands verified 2026-10-12).

**Can be done independently:** Yes, and it should happen first.

- Inspect the repository, Git status, folder structure, dependencies,
  scripts, and existing functionality.
- Identify framework versions and current coding conventions.
- Run existing lint, type-check, and test commands where possible.
- List broken commands, missing environment variables, and setup
  blockers.
- Do not scaffold over or rewrite existing work.

**Deliverable:** A concise audit report and a list of verified commands.

## 0.2 Product scope and initial user journeys

**Status:** Done (confirmed in `docs/product-scope.md` 2026-10-12:
two themes, subdomains only, images in, magic-link sign-in).

**Can be done independently:** Yes, in parallel with 0.1.

Define the minimum journeys: - Visitor opens a restaurant website and
browses its menu. - Restaurant owner signs in and edits restaurant
details or a menu item. - Owner previews changes and publishes them. -
Platform operator creates a restaurant and assigns an owner. - A visitor
reaches a restaurant through its assigned host/domain.

Write explicit out-of-scope items, including ordering, reservations,
payments, and POS integrations. Confirmed: reservations are post-MVP
(see Phase 8) and must not shape the MVP data model.

**Deliverable:** `docs/product-scope.md` with acceptance criteria for
the MVP.

## 0.3 Architecture decisions

**Status:** Done (0001 stack, 0002 resolutions, 0003 tenant model
approved 2026-10-12). Phase 1 parallel work unblocked.

**Can be done independently:** Partially. Use the repository audit as
input before finalising decisions.

Record concise decisions for: - Next.js/TypeScript application
structure, or the existing equivalent. - PostgreSQL schema and Drizzle
migrations, if appropriate to the current project. - Authentication and
roles. - Tenant identification and access control. - Draft/published
content strategy. - Theme registry and configuration. - Image/file
storage. - Deployment and domain strategy.

Prefer reversible decisions and simple implementations. Do not add
infrastructure before the MVP needs it.

**Deliverable:** Short decision records under `docs/decisions/`.

## 0.4 Local development and quality gates

**Status:** Done (`README.md` setup docs, `.env.example`, `npm run check`,
Vitest + Playwright suites, and CI workflow all in place).

**Can be done independently:** Mostly, after 0.1 identifies existing
tooling.

- Document setup and environment variables.
- Establish or confirm scripts for development, lint, type checking,
  tests, and database migrations.
- Add `.env.example` with placeholders only.
- Ensure the app can be run by another developer using the documented
  steps.
- Add a small CI workflow if the repository and hosting setup make it
  practical.

**Deliverable:** Updated `README.md`, `.env.example`, and reproducible
quality-check commands.

---

# Phase 1: Foundation and shared contracts

**Goal:** Establish the domain model, interfaces, and security baseline
so separate feature work can proceed without inventing incompatible
assumptions.

**Exit criteria:** Database migrations work, shared types and validation
schemas exist, and tenant-access rules are tested.

## 1.1 Domain model and database schema

**Status:** Done 2026-10-12 (`dc53a49`, Adminer follow-up `a315cf8`). Six
tables (`db/schema.ts`) with uuid PKs, tenant FKs, indexes, checks,
timestamps, and cascade/set-null rules; committed SQL in `db/migrations/`;
fresh-DB migrate + 11 live-constraint checks verified; profile-gated
Adminer viewer on :7070 for local inspection.

**Can be done independently:** Yes, once the key decisions from Phase 0
are agreed.

Design the minimum schema for: - Restaurants/tenants. - Users,
memberships, and roles, as required by the chosen auth model. -
Restaurant profile and contact information. - Opening hours. - Menu
categories. - Menu items. - Theme selection. - Draft/published content,
if not handled through a separate content structure. - Domain records,
introduced when needed.

Include foreign keys, appropriate indexes, timestamps, constraints, and
clear deletion behaviour. Avoid creating speculative tables for features
outside the MVP.

**Deliverable:** Schema definitions and versioned migrations.

## 1.2 Shared types and validation contracts

**Status:** Done 2026-10-12 (commits `826224f`, `601f651`, `fcace7a`,
`e494a5f`, `aa7bde7`). Domain types with public/owner views
(`src/lib/restaurant.ts`), Zod validation schemas (`src/lib/validation.ts`),
and the `ok`/`err` service contract (`src/lib/result.ts`); 93/93 unit
tests green; `db:generate` confirms zero SQL drift.

**Can be done independently:** Yes, in parallel with 1.1 if the agent
coordinates proposed fields before finalising them.

- Define types for restaurant profiles, menu categories, menu items,
  theme identifiers, and public restaurant content.
- Define server-side validation schemas.
- Define stable error shapes and expected results for the service/API
  boundary.
- Distinguish public data from private owner and operator data.
- Avoid duplicating the same validation rules across UI and server
  code.

**Deliverable:** Shared domain types and validation schemas.

**Coordination note:** The schema and shared contracts must agree. One
agent should integrate changes and resolve conflicts before downstream
implementation begins.

## 1.3 Authentication and authorisation

**Status:** Done 2026-10-12 (pinned `next-auth@5.0.0-beta.32` +
`@auth/drizzle-adapter@1.11.3`, adapter tables with global `role`, magic-link
provider, session role callback, `proxy.ts` gate, pure permission helpers;
112/112 tests green, build green).

**Update 2026-10-13 (3.9):** magic-link delivery is now tested end to
end — the owner-journey E2E requests a real sign-in link through the
app, retrieves it from Mailpit, and completes sign-in. Local SMTP stays
provisioned via the `mailpit` service in `docker-compose.yml` (SMTP
`:1025`, inbox UI `:8025`; `EMAIL_SERVER` / `EMAIL_FROM` defaults in
`.env.example`). Operator invites (4.2) reuse this proven path.

**Can be done independently:** Yes, after the authentication decision is
made.

- Integrate the selected authentication solution.
- Define platform-operator and restaurant-owner permissions.
- Implement server-side session checks.
- Ensure owner routes and mutations require valid permissions.
- Do not create a custom password/session system.
- Do not use client-side visibility as a substitute for authorisation.

**Deliverable:** A tested authentication and role-checking foundation.

## 1.4 Tenant-scoped data access

**Status:** Done 2026-10-12. Authorised context via slug+membership join
(`src/lib/tenant-context.ts`, no existence oracle), scoped loaders +
owner view + one scoped mutation (`src/lib/tenant-data.ts`, context-only
APIs — no tenant-id parameters), pure unit tests plus a live 4-case
cross-tenant isolation suite (`src/lib/tenant-isolation.test.ts`, opt-in
via `TEST_DATABASE_URL`); 128/128 tests green with a database, build
green. Unblocks Phase 1 exit: migrations work, contracts exist, and
tenant-access rules are tested.

**Can be done independently:** Yes, after 1.1 and the core auth model
are agreed.

- Create a consistent server-side way to obtain the authorised tenant
  context.
- Scope all tenant-owned queries and mutations to that tenant.
- Check access to child records such as menu items and categories.
- Avoid trusting client-supplied tenant IDs.
- Add negative tests for cross-tenant reads and mutations.

**Deliverable:** Reusable tenant-scoped data access patterns and
automated isolation tests.

## 1.5 Shared UI foundation

**Status:** Done 2026-10-12 (`481ecfe`, merged in `21bfba4`). Tailwind
primitives under `src/components/ui` with colocated RTL tests.

**Can be done independently:** Yes, in parallel with database/auth work
if it does not change shared domain contracts.

- Set up shared layout, typography, spacing, form controls, buttons,
  navigation, and feedback components.
- Include accessible labels, focus states, loading states, and error
  states.
- Establish responsive breakpoints and component conventions.
- Do not build the complete dashboard yet.

**Deliverable:** A small, consistent UI foundation.

### Phase 1 parallel work guidance

Reasonably independent streams: - Agent A: schema and migrations
(1.1). - Agent B: UI foundation (1.5). - Agent C: authentication
investigation or integration (1.3), after the auth choice is approved. -
Agent D: domain types and validation proposals (1.2).

Keep 1.4 coordinated with the final tenant model and authentication
approach. Avoid multiple agents editing the same schema, shared types,
package manifest, or routing files concurrently.

---

# Phase 2: Public restaurant websites and themes

**Goal:** Render attractive, responsive restaurant websites from
published tenant data.

**Exit criteria:** A test tenant can render a public website using
multiple themes, with only public and published data exposed.

## 2.1 Public restaurant data service

**Status:** Done 2026-10-12 (`src/lib/public-restaurant.ts`).
Published-only view: tenant must be `published`, categories need
`is_published`, items need `is_published AND is_available`, empty
categories dropped; unknown/unpublished/malformed slugs all yield the
same `NOT_FOUND`. Pure mapping tests plus live cases in the gated
isolation suite; 134/134 tests green with a database.

**Can be done independently:** Yes, after the domain model and tenant
resolution contract are stable.

- Fetch a public, sanitised restaurant view model.
- Return only fields intended for public display.
- Return published content only.
- Handle unknown tenants, missing content, and unpublished sites
  safely.
- Avoid exposing internal IDs, owner data, credentials, or private
  configuration unnecessarily.

**Deliverable:** Tested public data-access/service layer.

## 2.2 Theme registry and shared theme contract

**Status:** Done 2026-10-12 (`src/themes/`). Typed contract
(`ThemeProps` carries only the validated `PublicRestaurant` view),
registry with café fallback for unknown/retired ids, `resolveThemeId`
through the shared Zod schema, and minimal café + takeaway themes on the
same model with empty states. A guard test fails if any theme imports
the database, session, or permission helpers. 143/143 tests green.

**Can be done independently:** Yes, once the public view model and theme
identifiers are agreed.

- Create a typed theme registry.
- Ensure all themes receive the same validated public content model.
- Keep database queries and authorisation outside theme components.
- Provide a safe fallback for missing or invalid theme configuration.
- Do not support arbitrary customer-supplied code.

**Deliverable:** Theme interface and registry.

## 2.3 Theme A: clean café style

**Status:** Done 2026-10-12. Café polished (warm centred narrative,
static accent map) and both themes composed from shared sections
(`HeroSection`/`MenuSection`/`VisitSection`); per-tenant options via
`tenants.theme_config` (migration 0003, no-migration future options)
with per-theme Zod schemas resolved defensively at render; takeaway
reuses the same sections. 156/156 tests green, build green.

**Can be done independently:** Yes, after 2.2's interface is stable.

- Create a mobile-first café/restaurant design.
- Display logo, name, menu categories/items, hours, contact details,
  and location.
- Include empty states for optional fields.
- Ensure good readability and accessible contrast.

**Deliverable:** First complete theme.

## 2.4 Theme B: modern takeaway style

**Status:** Done 2026-10-12. Dark hero band with a `tel:` call CTA (plain
contact link — no ordering), compact dotted-leader menu via a `layout`
variant on the shared `MenuSection`, and a "Find us" strip reusing
`VisitSection`; descriptions kept visible in compact rows. 160/160 tests
green, build green.

**Can be done independently:** Yes, in parallel with 2.3 once the theme
interface is stable.

- Create a visually distinct layout suitable for takeaway businesses.
- Reuse the same content model.
- Do not implement ordering or payment features.
- Keep all essential restaurant information available.

**Deliverable:** Second complete theme.

## 2.5 Theme C: optional additional style

**Status:** Done. The optional third style shipped as `bistro` (split
hero, card menu, deeper accent palettes) in Phase C. The later
appearance round added two more fully distinct looks — `diner` and
`garden` — plus migration-free refreshes of `café` and `takeaway`; see
"Appearance round" below and `docs/decisions/0004-theme-directions.md`.
Five themes ship.

**Can be done independently:** Yes, in parallel with other theme work if
time and quality permit.

- Build a third distinct style only if it provides meaningful variety.
- Prioritise polish and responsive behaviour over the number of
  themes.

**Deliverable:** Optional third theme.

## 2.6 Host and tenant resolution

**Status:** Done 2026-10-12 (`src/lib/tenant-resolution.ts`).
`resolveTenantByHost` implements 0003 (normalise → exact custom-domain
match → platform subdomain → not-found, reserved slugs short-circuit,
`localhost` subdomains for development via `PLATFORM_BASE_DOMAIN`);
returns identity only, visibility re-checked downstream; no cache in the
MVP by decision. Live tests cover valid, unknown, ambiguous
(custom-domain precedence), reserved, nested, and malformed hosts.

**Can be done independently:** Partially. Build the resolution logic
separately, but coordinate its interface with deployment and public
routing.

- Define how development hosts and platform-provided subdomains map to
  tenants.
- Handle platform domains, local development, unknown hosts, and
  invalid mappings.
- Keep custom-domain verification as a separate step.
- Add tests for valid, unknown, and ambiguous hostnames.

**Deliverable:** A tested hostname-to-tenant resolver.

## 2.7 Public-page integration and visual checks

**Status:** Done 2026-10-12. Root page resolves the `Host` header →
loads the published view → renders the tenant theme (streams in
`<Suspense>`, partial prerender); `db/seed.ts` (`npm run db:seed`,
idempotent) provides two published tenants plus an unpublished draft;
gated flow tests plus live HTTP checks with `Host` headers prove no
cross-tenant leaks and invisible drafts. Real-browser visual review of
mobile/desktop layouts remains for pilot readiness (6.3).

**Can be done independently:** No, this integrates the earlier work.

- Connect host resolution, public data service, and theme registry.
- Add representative seed data for multiple tenants.
- Test mobile and desktop layouts.
- Verify that one tenant's content never appears on another tenant's
  host.
- Verify unpublished content is not publicly visible.

**Deliverable:** A working public restaurant website flow.

### Phase 2 parallel work guidance

After the public content contract and theme interface are agreed: -
Agent A: Theme A. - Agent B: Theme B. - Agent C: public data service and
tests. - Agent D: host-resolution logic and tests.

Integration ownership must be explicit. Theme agents should not modify
the database schema or tenant-resolution rules.

---

# Phase 3: Owner dashboard and restaurant content management

**Goal:** Allow owners to manage their own restaurant's content safely.

**Exit criteria:** An authorised owner can update profile/menu content,
select a theme, preview changes, and publish them.

## 3.1 Dashboard shell and navigation — Done

**Can be done independently:** Yes, after the UI foundation and auth
route patterns are stable.

- Build a responsive dashboard layout.
- Show only navigation items allowed for the current role.
- Add clear empty, loading, and error states.
- Protect routes on the server.

**Deliverable:** Authenticated dashboard shell.

Done: `src/app/login` (magic-link request; pure `parseLoginForm` +
`safeNext` confine `?next=` to same-origin paths), `listUserTenants`
in `src/lib/tenant-context.ts` (user-pinned join, unit + live-tested),
`src/app/dashboard` (landing with member-tenant list and no-restaurant
empty state; `[slug]` shell with sticky `SiteNav`, role-filtered nav
from pure `getDashboardNav`, overview with status/counts/quick links;
`loading.tsx` + `error.tsx` with retry), `src/app/operator` (stub
behind `requireOperator`, lands fully in Phase 4). Anonymous dashboard
visitors bounce to `/login`; unknown slug and no-membership render the
same `notFound()` (no oracle). Nav section targets (profile/hours/menu
/theme) arrive with the 3.2–3.5 editors; until then they render the
root not-found page. No path-based "view public site" link: public
sites are host-resolved (see `src/app/page.tsx`), so no URL exists to
link to. All new routes partial-prerender (static shell, streamed
session content); Cache Components notes: `"use server"` modules may
only export async functions (pure login parsing lives in
`login-form.ts`), and authenticated routes stream via `loading.tsx` /
`<Suspense>` — `force-dynamic` is rejected under `cacheComponents`.

## 3.2 Restaurant profile editor — Done

**Can be done independently:** Yes, after the data and validation
contracts are stable.

- Edit restaurant name, public contact details, address, and other
  agreed profile fields.
- Validate input on the server.
- Save only within the authorised tenant.
- Display success and failure feedback.

**Deliverable:** Tested profile editor.

Done: `updateTenantProfile` in `src/lib/tenant-data.ts` (validate →
scope → save, insert when no profile yet; `undefined` keeps, `null`
clears, cleared `name` rejected since the DB requires one) behind the
`src/app/dashboard/[slug]/profile` editor (server action + `Field`
form with per-field errors, typed-input echo on rejection, `role="status"`
save confirmation, `revalidatePath` so the overview reflects saves).
Logo excluded until 3.6 owns uploads. Also fixed a real 1.2 bug the
editor exposed: `updateProfileSchema.email` rejected `undefined`
(hand-rolled union; now `.nullish()` like its siblings). Pure form
mapping lives in `form.ts` — `"use server"` modules may only export
async functions (same lesson as 3.1).

## 3.3 Opening-hours editor — Done

**Can be done independently:** Yes, once the opening-hours data model is
agreed.

- Support opening and closing times per day.
- Support closed days and clearly defined special cases, if included.
- Validate time ranges and avoid ambiguous representations.
- Render hours consistently on public themes.

**Deliverable:** Hours editor and public display integration.

Done: `updateHoursSchema` in `src/lib/validation.ts` (exactly 7 days,
unique weekdays 0–6, per-day open/closed rules reused from
`openingHoursSchema`) plus `updateTenantHours` in `src/lib/tenant-data.ts`
(validate → upsert each weekday scoped to the context tenant → return the
week ordered Sunday-first; full-week replacement so the public `HoursList`
never renders a half-edited week) behind the
`src/app/dashboard/[slug]/hours` editor (server action + per-day
closed-checkbox/time-input form with per-day errors, typed-input echo on
rejection, `role="status"` save confirmation, `revalidatePath` so the
overview reflects saves; overview gained an "Edit hours" link). Pure form
mapping lives in `form.ts` — `"use server"` modules may only export
async functions (same lesson as 3.1/3.2). Unsaved days default to closed;
public display needed no change (`HoursList` already renders stored rows
sorted with "Closed" for closed days, overnight ranges pass through).
178/178 unit tests green (3 gated live suites skip without a database),
lint + typecheck green, build green with the hours route partial-
prerendered like the other editors.

## 3.4 Menu category management — Done

**Can be done independently:** Yes, after menu contracts are stable.

- Create, edit, reorder, and deactivate or delete categories according
  to the agreed deletion rules.
- Handle categories containing menu items safely.
- Enforce tenant ownership on every operation.

**Deliverable:** Category management flow.

Done: `createTenantCategory` / `updateTenantCategory` /
`deleteTenantCategory` / `moveTenantCategory` in `src/lib/tenant-data.ts`
(validate → ownership-check → save, all scoped to the context tenant;
duplicate names rejected with a field error, including a `23505` mapping
for lost races; new categories go last, the server owns `sortOrder`;
delete keeps items as uncategorised via the `SET NULL` FK and reports the
count; move renumbers the whole list by index so shared `sortOrder`
values never block reordering) behind the
`src/app/dashboard/[slug]/menu` screens (ordered list with item counts,
move up/down posts, per-category editor with rename/description/
published toggle, two-step delete with an honest uncategorised warning
and redirect). Pure form mapping lives in `form.ts` — `"use server"`
modules may only export async functions (same lesson as 3.1–3.3). Live
gated isolation suite covers create/duplicate/move/delete-
uncategorised plus cross-tenant `FORBIDDEN` on update/delete/move
(8/8 green against local Postgres 2026-10-13); 187/187 unit tests green
without a database, lint + typecheck green, build green with both menu
routes partial-prerendered.

## 3.5 Menu item management — Done

**Can be done independently:** Yes, after the menu category and item
contracts are stable.

- Create and edit item name, description, price, category, image, and
  availability/visibility if included in scope.
- Validate price representation and required fields.
- Handle missing or optional descriptions and images.
- Enforce tenant ownership.

**Deliverable:** Menu item management flow.

Done: `createTenantItem` / `updateTenantItem` / `deleteTenantItem` in
`src/lib/tenant-data.ts` (validate → ownership-check → save, all scoped
to the context tenant; a set `categoryId` is proven to belong to the
tenant on both create and update, closing a cross-tenant link forgery;
new items go last; `null` names rejected; `null` categoryId means
uncategorised; items are leaves so deletion is immediate) behind the
`src/app/dashboard/[slug]/menu/items` screens (list grouped by category
with price/visibility badges, create form with category select, per-item
editor with published/available toggles and two-step delete). Money
crosses the form as a dollars string parsed to integer cents by pure
`parsePriceToCents` (`form.ts`) — the database never sees a float — and
unparseable prices fail keyed to `priceCents` with a dollars-worded
message. Photos excluded: `imageKey` rides the contract for 3.6 uploads
but no 3.5 form sends one (same as the logo in 3.2). No item reorder:
not required by 3.5, recategorising via edit covers organisation. Live
gated isolation suite covers create/update-recategorise, forged-category
refusals, cross-tenant update/delete `FORBIDDEN`, and delete (9/9 green
against local Postgres 2026-10-13); 210/210 unit tests green without a
database, `npm run check` green, build green with both item routes
partial-prerendered.

## 3.6 Logo and image upload — Done

**Can be done independently:** Yes, after the storage provider and
upload contract are chosen.

- Upload and replace logos and menu/item images.
- Restrict file size and allowed file types.
- Store files safely and avoid trusting user-provided paths.
- Provide upload progress or clear feedback.
- Handle failed uploads and unused files appropriately.

**Deliverable:** Secure upload flow.

Done: `src/lib/storage.ts` (local-filesystem driver behind the
provider-neutral key shape 0002 §5 targets for R2: `tenants/{id}/
logos|items/{random}.{ext}`, JPEG/PNG/WebP, 2 MB cap, magic-byte sniff
matching the declared MIME, strict key allowlist + contained resolve so
traversal is structural; `STORAGE_DIR` override for tests; dev-only
under git-ignored `local/uploads`) with `setTenantLogo` /
`setTenantItemImage` / `clearTenantItemImage` in `tenant-data.ts`
(validate → ownership-check → store → link → remove the replaced file;
item deletion removes its photo too; link-write failures clean up the
new file) wired into the profile editor (logo input + preview, honest
"profile saved, logo not" partial messaging — never false success) and
the item editor (photo input + preview + remove checkbox), served back
unauthenticated via `/api/images/[…key]` as unguessable capability URLs
with immutable long caching, and rendered on both themes (logo in the
hero, thumbnails in both menu layouts, nothing when keyless). File
inputs can't be re-echoed, so failures ask to reselect. Live gated
isolation suite covers logo replace (old file gone), photo set/clear,
forged-item `FORBIDDEN` on both photo paths, and delete-removes-file
(10/10 green against local Postgres 2026-10-13); 224/224 unit tests
green without a database, `npm run check` green, build green. R2 stays
open: swapping the driver module (account + keys + SDK) is the only
move needed before any hosted environment.

## 3.7 Theme selection and preview — Done

**Can be done independently:** Yes, after the theme registry and draft
model are stable.

- Show available themes.
- Save the selected theme for the authorised restaurant.
- Preview the restaurant with draft content and the selected theme.
- Prevent another tenant's preview from being accessed.

**Deliverable:** Theme selection and private preview.

Done: `toPreviewRestaurant` in `src/lib/preview-restaurant.ts` (pure
assembly of the theme input shape with nothing filtered — unpublished
categories/items included, so owners see what publishing would put
live) behind `src/app/dashboard/[slug]/theme` (every registered theme
with per-card save through the existing scoped `updateTenantSettings`;
the refreshed Current badge confirms) and `theme/preview` (renders the
selected theme with the draft view under a draft banner, membership-
gated like every dashboard page — forged slugs get the same `notFound()`).
Also fixed a real 2.3 gap the preview exposed: `Tenant` never carried
`themeConfig`, so per-tenant options were dropped at the context
boundary — now typed on the domain model and plumbed through
`toTenantContext` / `updateTenantSettings` (same class of find as the
3.2 email bug). Live gated isolation suite proves the preview shows a
draft category the public view hides, plus stranger-context refusal
(11/11 green against local Postgres 2026-10-13); 227/227 unit tests
green without a database, `npm run check` green, build green.

## 3.8 Draft and publish flow — Done

**Can be done independently:** Partially. The UI can be developed
separately, but publishing must integrate with the chosen content model
and public data service.

- Let owners distinguish draft changes from live content.
- Publish only after server-side authorisation and successful
  persistence.
- Ensure public pages use published data only.
- Show the current publishing state and clear errors.
- Avoid reporting success if publication failed.

**Deliverable:** Tested preview-to-publish journey.

Done: `src/app/dashboard/[slug]/publishing` (Live/Draft state in plain
words, advisory readiness checklist — profile, published menu, hours —
linking to the editors that fill the gaps, one-click publish, two-step
unpublish since it takes the site offline, persistence failures surface
as errors never false success; overview links in with a Live/Draft
badge). The flip reuses the scoped `updateTenantSettings`, so
server-side authorisation and persistence-then-report hold by
construction. Draft semantics stated honestly on the page: the flag
gates the whole site and unpublished records stay hidden, but edits to
visible records go live immediately — no edit-staging or versioning in
the MVP; the 3.7 preview is how owners check drafts. Live gated
isolation suite cycles publish → public-visible → unpublish →
`NOT_FOUND` on one tenant while the neighbour is untouched (12/12 green
against local Postgres 2026-10-13); 231/231 unit tests green without a
database, `npm run check` green, build green.

## 3.9 Owner journey integration — Done

**Can be done independently:** No, this integrates the dashboard
modules.

- Test sign-in, profile editing, hours editing, category/item
  management, theme selection, preview, and publishing.
- Check permission failures and cross-tenant attempts.
- Fix inconsistent states between the dashboard and public website.

**Deliverable:** End-to-end owner workflow.

Done 2026-10-13: `e2e/owner-journey.spec.ts` drives the full workflow
against the real stack (production build, Postgres, Mailpit) — magic-link
sign-in via the actual email, profile save, category + item creation,
hours save, theme switch, draft preview, publish, public-site
verification on the tenant subdomain, and unpublish cleanup. Global
setup (`e2e/global-setup.ts` + `helpers.ts`) seeds a deterministic
draft tenant and the suite purges Mailpit first, so re-runs are stable
(green in ~11 s locally). CI grew Postgres + Mailpit services,
test-only auth/mail env, a `db:migrate` step, and `TEST_DATABASE_URL`
so the 12 live isolation tests also run per push/PR. The obsolete
starter-content `e2e/home.spec.ts` was removed.

Two real finds fixed along the way: (1) the login page's Suspense
fallback rendered a second live `LoginForm` whose stale server-action
reference made sign-in silently do nothing — replaced with the
non-interactive `LoginFormSkeleton` (the spec asserts exactly one live
form); (2) category/item lists are server-rendered and `useActionState`
saves don't refresh them — the spec reloads after creates, matching
real navigation. Cross-tenant and permission-failure paths stay covered
by the gated isolation suite (now running in CI), not duplicated in the
browser journey.

### Phase 3 parallel work guidance

After shared data contracts are stable: - Agent A: profile and hours
editor. - Agent B: menu category/item screens. - Agent C: image upload,
once storage conventions are settled. - Agent D: dashboard shell and
accessibility checks.

Keep draft/publish and theme preview coordinated with the public data
service. Avoid parallel changes to the same form components or domain
schemas.

---

# Appearance round (detour between Phase 3 and Phase 4) — Done

**Status:** Done 2026-10-14, on `appearance-enhancement-exploration`
(commits `974f259`…`786e93f`). Directions and the reasoning behind them:
`docs/decisions/0004-theme-directions.md`. How to change appearance safely:
`docs/design-system.md`.

**Why:** Phase 3 closed with a working dashboard over three themes that
shared one warm cast, display face, and section rhythm; the roadmap allows
a bounded visual detour while the theme pipeline is still cheap to change.
Directions were researched and owner-approved before building (0004).

**What shipped**

- **Diner Revival (`diner`)** — retro comfort food: cherry/butter/cola
  ramps authored in OKLCH, the platform's first light hero band under dark
  text, a Caprasimo display face, an awning crown, a framed menu board, and
  a call-to-order strip.
- **Market Garden (`garden`)** — the first cool-palette family (green/teal
  on slate), an asymmetric hero, a two-column menu/visit split, and a
  `From the market this week` module derived from the tenant's own menu.
  Shipped with **no migration**: 0004 had already widened the theme CHECK
  for both new ids in one step (migration 0005), so the database was ahead
  of the app by design.
- **Migration-free refreshes** — café is Modern Trattoria (warm
  espresso/terracotta/tomato inks, a hero that hands straight to the menu)
  and takeaway is Night Market (near-black bands, one call to action, hours
  folded into a single visit block, answering the round's research notes on
  competing CTAs and scanability).
- **Hardening the round exposed** — the accent-contrast guard became a
  committed unit test (`src/themes/contrast.test.ts`), which immediately
  caught a real shipped failure in the `gold` accent (band/button
  2.7–2.9:1, rule 1.8:1); the dashboard accent swatches were missing six
  palettes; and the theme visibility toggle silently saved nothing for
  every non-café theme.
- **Demos** — `db/seed.ts` publishes `rosies-diner` and `the-greenhouse`
  (plus one deliberately long menu item) so every look is inspectable in a
  real browser, and is ready for Phase 7 demos.

**Verification:** `npm run check`, 311 unit tests including the live
database suites, `npm run build`, and the owner-journey E2E, all green. The
round's visual pass drove all seeded looks through real Chromium at 390 px
and 1440 px, light and dark, asserting rendered overflow, clipped text,
broken images, tap targets, heading structure, empty states, and computed
contrast: 20/20 combinations clean. That replaced the computed-style
sign-off the earlier diner round had to settle for.

**Scope note:** the MVP scope agreed two themes (0.2). Five now ship — a
product decision recorded in 0004, not scope drift; journeys, the data
model, and the acceptance criteria in `docs/product-scope.md` are
unchanged.

**Deferred:** Counter Culture (brutalist/grotesk) stays unbuilt until the
add-a-theme pipeline has run more than once; per-tenant typography presets
would be a config-schema change on the existing `--display-font`
mechanism and are not scheduled. Bistro has no public demo tenant — it is
reachable through the dashboard theme picker and preview.

---

# Phase 4: Platform operator and onboarding

**Goal:** Let the platform operator configure and support customer
tenants without direct database editing.

**Exit criteria:** The operator can create a tenant, assign an owner,
choose a theme, and inspect its setup status.

## 4.1 Operator access and role protection

**Status:** Done 2026-10-14. One gate owns operator access
(`src/lib/operator-access.ts`): a pure decision (`operatorGate`) plus
`requireOperatorPage` for pages. `/operator` routes through it — anonymous
visitors go to `/login?next=/operator`, and a signed-in owner sees the same
not-found page as an unknown route, so the console's existence is never
confirmed to them.

The role authority is `users.role` as loaded from the database by the
Auth.js adapter; nothing request-supplied is consulted. Three guards keep
it that way: a structural test requires every `page`/`layout`/`route`/
`actions` file under `src/app/operator` (at any depth) to call the gate; a
tripwire fails if any module under `src/` assigns `users.role` (the 4.2
provisioning module goes on an allowlist there rather than removing the
guard); and the gate must stay off client bundles.

**Verification:** 18 unit tests across `operator-access.test.ts` and the
near-miss role cases in `permissions.test.ts`; new `e2e/operator-access.spec.ts`
proves the deployed behaviour — anonymous redirect, owner 404, promotion
attempts via query string leaving the stored role `owner`, forged staff
headers refused, and platform staff reaching the console (previously
untested: no operator user had ever existed in the suite). E2E sessions are
seeded straight into the database so the spec cannot race the owner
journey's Mailpit purge, and the staff fixture is a `users.role` row — the
same act 4.2's provisioning will perform.

**Found and fixed while testing this:** `proxy.ts` — the edge first-pass
gate from Phase 1.3 — had never run. Next only loads the file at the app
directory's own level (`src/proxy.ts` for a `src/app` project), so the
repository-root copy was inert; the move is proven by the redirect it now
produces and by the owner journey still signing in and navigating (signed-in
users are not blocked). The failure was quiet by construction: the
page-level check still guarded every route, so an anonymous hit was merely
_streamed_ a redirect inside a 200 shell rather than bounced with a real 302
before rendering — which is why the missing 302, not a broken page, was the
only evidence. Verified by contrast: with the matcher neutered, the same
URLs answer 200. The fix was then re-checked against a real production
server (`next start`), since dev-server behaviour and a build that merely
lists `ƒ Proxy (Middleware)` prove neither that a request is bounced. That
run also confirmed the redirect cannot be steered by a forged `Host`
header: the target follows the configured auth origin, so the gate is not
an open redirect.

**Regression guard for that failure:** `npm run smoke` (`scripts/smoke.ts`,
rules in the pure `src/lib/route-smoke.ts`) points at any origin and asserts
what the platform promises — every private path bounces with the edge gate's
own 302 to `/login?next=<path>`, every public path stays open with a 200. The
status code is the assertion, not the body: a protected path answering 200
(streamed redirect inside a shell) or 307 (a page-level `redirect()`
covering for the gate) is a failure, so the exact way the gate went missing
cannot pass again. Tested three ways against a production server: it passes
as shipped; with the matcher emptied, four protected routes answer 200 — the
exact original signature — and it exits 1; and with `/login` added to the
matcher, the two public routes are flagged as an over-broad gate while the
protected half still passes, so the two failure modes are distinguishable.
It works against a deployed origin, where a build listing `ƒ Proxy
(Middleware)` proved nothing either way on its own. CI runs it as a release
gate on every push: the production build is started on 4031 (the E2E owns
4030 and, with `reuseExistingServer` off in CI, refuses to start beside an
existing server), `--wait` covers the boot instead of a fixed sleep, and a
non-zero exit fails the job — so the gate going silently inert now breaks the
build rather than reaching a deploy.

**Note for 4.2:** operator _actions_ still have no consumer. When one
lands it needs the structured variant (`requireOperator` → an error state
to return), not the navigating one: an action must fail closed with a
result rather than redirect.

**Can be done independently:** Yes, after the role model is stable.

- Protect operator-only routes and actions on the server.
- Prevent ordinary restaurant owners from granting themselves operator
  privileges.
- Add tests for forbidden access.

**Deliverable:** Secure operator access.

## 4.2 Restaurant creation and configuration

**Status:** Done 2026-10-14. An operator creates a restaurant from
`/operator/tenants/new` — address, display name, default theme, and whether
it starts published — then follows the link to its page and grants the
person who will run it access by email. The privileged work lives in
`src/lib/tenant-provisioning.ts`, and the server actions in
`src/app/operator/actions.ts` only resolve the caller and map the result,
which is what 4.1's note asked for: they call the structured
`requireOperator` and fail closed with a result, because an action cannot
`redirect()` — it would either throw or answer with a 200 the browser
ignores.

Two silences are deliberate and load-bearing. Creating a tenant does NOT
make the operator a member of it, so the onboarding check "owner access
configured" still means something the moment a restaurant exists. And
provisioning never writes an elevated role: an invited owner's account is
created on the platform DEFAULT, the same row a first magic-link sign-in
produces, so the invite path cannot promote anyone to platform staff. The
tripwire in `operator-access.test.ts` keeps it that way — that one module
is named as the only code allowed to write `users.role`.

The tenant and its profile are written in one transaction. Two sequential
inserts would leave a nameless tenant behind when the second failed, and
that half-created row is quiet: it reports as "profile not started" rather
than as the failure it is. Invalid and duplicate identifiers are refused
before anything is written — the address is validated as a slug, and a
duplicate is recognised through Drizzle's error wrapper instead of by
matching a driver's message.

**Verification:** 26 unit tests in `tenant-provisioning.test.ts` (the
transaction, the duplicate, and the never-writes-a-role cases among them);
`e2e/operator-provisioning.spec.ts` drives the real form and every refusal
— invalid address, duplicate address, a second grant, and an ordinary owner
who must learn nothing about the console or the restaurant — then signs the
invited owner in to prove the membership really opens a dashboard rather
than merely existing as a row. `npm run smoke` claims both new private
paths and verifies each bounces with the edge gate's own 302 (9 routes).

**Can be done independently:** Yes, after tenant schema and auth
contracts are stable.

- Create a restaurant tenant with required fields.
- Assign or invite an owner using the selected authentication system.
- Select a default theme.
- Initialise safe default content and publishing state.
- Prevent duplicate or invalid tenant identifiers.

**Deliverable:** Operator tenant setup flow.

## 4.3 Onboarding checklist and status

**Status:** Done 2026-10-14. The rules are pure and live in
`src/lib/onboarding.ts`; `/operator` lists every restaurant newest first
with the gaps that actually block a usable site, and each restaurant's page
carries the full seven-step checklist — profile, menu, hours, theme, owner,
domain, published.

Three things the steps deliberately do not do. They do not re-invent the
owner's rules: profile, menu, and hours ask through `lib/readiness.ts`, the
same predicates the owner's publishing checklist uses, so the two surfaces
cannot contradict each other. They do not treat a custom domain as a
blocker — the platform address works and custom domains are Phase 5 — so it
is marked optional and reported as RECORDED, never as live, because 5.3 is
explicit that a domain must not be called live before routing and TLS do.
And they do not pretend to know which theme was CHOSEN: `tenants.theme` is
NOT NULL with a platform default and 4.2 writes an explicit value at
creation, so nothing records whether a decision was made and the step
reports which theme instead of gating on it.

`required` is stated once and read by both views: the console's counts and
each restaurant's checklist come from the same function, so a gap can never
be a blocker on one page and merely unset on the other.

**Verification:** 20 unit tests pin the rules — including exactly what a
just-provisioned restaurant looks like (2 of 7 set, blocked on menu, hours,
owner, and publishing) — and 21 pin the read's authorisation and mapping.
`e2e/operator-provisioning.spec.ts` reads both views through the browser,
including that granting an owner turns "No owner assigned" into "1 person",
so the status view is a live reading rather than a static description.
Whole suite green: 426 unit tests, 13 E2E tests.

**Found and fixed while testing this:** every operator click from the console
into a restaurant logged a Next 16 insight —
`/operator/tenants/[slug]: Next.js encountered uncached data during
prerendering or a navigation` — naming the session read. Nothing in the suite
or in a hard load showed it, because it fires on the client navigation an
operator actually performs: it took a browser, a fresh dev server and the
click to see. The cause was this round's own page reading its address at the
top. The App Shell shared by every link into `/operator/tenants/*` cannot
carry a value that belongs to one link, so the route stopped painting and
blocked on the server instead. The body now sits behind its own `<Suspense>`
boundary with a fallback shaped like the page it stands in for — the fix the
insight itself recommends, and what the sibling operator routes already get
from `loading.tsx`. Verified by contrast on a fresh server, same click path
both times: the stock page logs the insight twice per click-through, this one
logs none, and the checklist, badges and owner card still render.

**Found while testing this, left open:** every authenticated partially-prerendered
route answers with a Next 16 warning — `crypto.getRandomValues()` while
prerendering — and it names `/dashboard` as well as the operator paths, so
it predates this round and is not caused by it. What happens is the safe
fallback (the route renders at request time), but a platform-wide warning
deserves its own pass rather than becoming a permanent fixture in every
run's output.

**Note for 4.4:** nothing records that an operator created a restaurant or
invited its owner — the provisioning path writes no audit row, and 4.4's
"record important operator actions" is where that belongs. The reads
already hand back setup facts rather than tenant content, which 4.4 can
widen deliberately or keep as it is.

**Can be done independently:** Yes, after the required setup states are
agreed.

Track only useful setup information, such as: - Restaurant profile
completed. - Menu entered. - Theme selected. - Owner access
configured. - Domain configured. - Website published.

**Deliverable:** Basic operator onboarding view.

## 4.4 Operator integration and auditability

**Status:** Done 2026-10-15. Every operator act that changes something now
writes a row to `audit_events`, in the SAME transaction as the change, and
each restaurant's page shows its own trail: who created it and who was
granted access, with the acting account's address and the time. The
vocabulary is closed ("tenant.created", "tenant.owner_granted") and lives in
`db/constants.ts` with a CHECK behind it, so a new recorded action is a
deliberate migration rather than something a caller can invent.

Four things make it a trail rather than a log, and each is a place this
could quietly have gone wrong. It is written inside the act's own
transaction — the tenant, its profile, and the record of its creation commit
together, so a restaurant cannot exist unrecorded. It records only what
SUCCEEDED: a refused grant, a duplicate address, and a rejected form write
nothing, because nothing changed. The actor's address is snapshotted from
the account row, never from the request, so a tampered session claim cannot
sign a wrong name into the history. And the detail payload is factual and
small — a theme id, a publishing flag, an invited address — never the
restaurant's name, menu, hours, or contact details: knowing who did what is
the brief, and not copying tenant content into a second table is the same
line 4.3's reads draw.

It also survives what it describes, which is where it deliberately
diverges from every other table here: `tenant_id` is `SET NULL` and the
actor carries no foreign key, so deleting a restaurant or closing an
account cannot delete the fact that someone created it. The snapshots
(`tenant_slug`, `actor_email`) are what keep those rows readable afterwards,
and the console's platform-wide feed is the one surface that can show a
record whose restaurant is gone — a deleted restaurant has no page left for
its history to appear on. That read joins the tenant with a LEFT join and
falls back to the recorded address, so the row is reported rather than
silently dropped.

On 4.4's other three bullets: the writes go through the one provisioning
module that already owns cross-tenant authority, and the reads through the
staff-gated modules 4.2/4.3 built, so nothing new was granted a way to
reach tenant data; the trail reads re-check the staff role themselves,
exactly like `operator-tenants.ts`, because none of them is scoped by a
`TenantContext`; and the E2E proves an ordinary owner reaches neither the
page nor the trail. "Avoid exposing private tenant data unnecessarily" is
satisfied by the trail holding acts and not content.

The console also carries a platform-wide feed: what staff have been doing,
newest first, each line naming the restaurant it was about and linking to it.
It is the second thing on the page on purpose — the console's job is what
still needs doing, and the feed is the record of what was done. It reads
across every restaurant in one query, which is what the shipped
`audit_events_created_idx` serves: without it the feed sorts the whole table
on every render. It shows the newest handful and is deliberately not
paginated; an operator who needs more reads that restaurant's own history,
and scrolling further back would be a keyset read (`created_at < cursor`)
rather than a bigger limit.

**Verification:** 17 unit tests pin the descriptions, the time format and
the read gate (an owner, a near-miss role and no identity at all get
FORBIDDEN without a read); 10 more pin when provisioning records and what it
hands down, including that a creation's record never contains the
restaurant's name. In `db-schema.test.ts`, the schema's own metadata is
checked as well as the committed SQL: the table is append-only (`created_at`,
no `updated_at`), its tenant reference is `SET NULL` rather than a cascade,
no foreign key ties it to the actor, and the vocabulary the app ships is the
vocabulary the CHECK allows. A live suite (`audit-live.test.ts`, opt-in on
`TEST_DATABASE_URL` like the other live suites) runs the REAL store against a
database and proves the four claims that matter: the creation is recorded and
linked to the tenant that now exists, the staff-gated read returns it, the
grant is recorded while the refused second grant is not, and both a deleted
restaurant and a deleted operator account leave the rows standing —
`tenant_id` null, the slug and the actor's address intact.
`e2e/operator-provisioning.spec.ts` reads the trail through the browser after
creating a restaurant and granting access (asserted inside the trail's own
region, because the operator's address appears elsewhere on the page), checks
the refusal left exactly one grant, and reads the console's feed for the
creation itself. The feed's own coverage: 10 unit tests pin its gate (the
same refusals, without a read) and how an entry's restaurant is named, and
the live suite proves it still shows a record whose restaurant has since been
deleted — by its address, rather than not at all. Whole suite green: 473 unit
tests without a database, 499 with one including the 26 opt-in live tests,
and 13 E2E tests; the route smoke check passes against a production server
on all 9 routes.

**Found while doing this:** the E2E's own cleanup was leaving one orphan
`tenant_id IS NULL` row per run, because the trail deliberately does not
cascade from `tenants` — the helper now deletes a spec's audit rows by their
slug snapshot before deleting the tenant, which is the only handle left
afterwards.

**Found while verifying the feed:** the console's "New restaurant" link was
a blocking route — navigating to it client-side logged Next's "encountered
uncached data" insight, exactly as `/operator/tenants/[slug]` did before
this round fixed that one. It hid from the suite and from hard loads for the
same reason as before: it fires only on the client navigation an operator
actually performs. `/operator/tenants/new` now keeps its header and its way
back in the App Shell and puts the session-gated form behind the same kind
of boundary, so both operator destinations an operator clicks into paint
immediately. The `dashboard` routes log the same insight and were NOT
touched: that is a platform-wide sweep of its own, the pass the crypto
warning above also needs.

**Note for later:** nothing records an operator READING a restaurant — only
what they changed — so the trail cannot answer "who looked at this", which
is the question that matters if staff access to owner content ever widens
beyond the setup facts it has today. One gap the same table can still absorb
without changing shape: platform-scoped acts such as granting the staff role
itself, which is why `tenant_id` is nullable and the vocabulary is a closed
set rather than a free string.

**Can be done independently:** Partially.

- Integrate the operator pages with the underlying tenant services.
- Record important operator actions where appropriate.
- Avoid exposing private tenant data unnecessarily.
- Confirm that operator actions cannot be performed by ordinary
  owners.

**Deliverable:** Tested operator workflow.

---

# Phase 5: Domains and publishing operations

**Goal:** Give each restaurant a reliable public address and a clear
process for connecting its own domain.

**Exit criteria:** The platform can map approved hostnames to the
correct tenant and communicate domain setup status clearly.

## 5.1 Platform subdomains

**Status:** In progress 2026-10-15 (`phase5`): format decided as
`{slug}.{PLATFORM_BASE_DOMAIN}` and recorded in
`docs/runbooks/platform-subdomains.md` (local `*.localhost` behavior,
Vercel wildcard production steps, limitations); hostname helpers hardened
(trim/case/FQDN trailing dot/IPv6/bracketed port, malformed-base refusal)
with 8 new unit cases; live resolution + public-flow suites green against
local Postgres (19/19). Blocked on operator input for the hosted step:
real base domain, Vercel project, and DNS access (see runbook).

**Can be done independently:** Yes, once host resolution and deployment
constraints are documented.

- Decide the platform's subdomain format.
- Configure wildcard DNS and hosting support if available.
- Resolve subdomains to the correct tenant.
- Test unknown and malformed subdomains.
- Document any provider limitations.

**Deliverable:** Working platform-provided hostnames in the target
environment.

## 5.2 Custom-domain records and verification

**Status:** Done 2026-10-15 (`phase5`). Owner-submitted claims with
dns-token verification: `tenants.custom_domain_status`
('none'/'pending'/'verified') + `custom_domain_verify_token`
(migration 0009, CHECKs keep claim/state/token together);
`src/lib/domain-claim.ts` owns every write (submit keeps the token on
re-submit, unique index refuses another tenant's domain as a
field-keyed CONFLICT, check flips to verified only on an exact
`_restaurant-platform.<domain>` TXT match with an injectable DNS seam,
remove clears all three). The resolver now honors custom domains ONLY
when verified — the 5.2 "no unverified attach" requirement is enforced
at the lookup, not by convention — and `updateTenantSettings` can no
longer write a domain without its state. Owner UI at
`/dashboard/[slug]/domain` (record → TXT instructions → check → switch
/ remove behind confirm), phrased so "verified" never reads as "live"
(routing/HTTPS stay 5.3, same line as 4.3's RECORDED). Operator
console badge keeps showing the recorded domain unchanged.
Verification: 13 new pure unit tests + 10-test live suite
(conflict, pending-does-not-resolved, verified flip unlocks the
hostname, DNS-failure honesty, scoping, idempotent removal) and a
2-test browser journey (`e2e/domain-claim.spec.ts`, disposable
fixture); whole suite green — 516+ unit, 15 E2E, build.
Found while testing: the owner journey's loose `getByText("Mains")`
matched the new nav's "Domain" item ("…doMAINS…" substring) —
fixed with exact matching. Also fixed before shipping: status
messages rendered inside a claim phase unmounted with it (removal
reported nothing), so results now render where they stay true.
Runbook: `docs/runbooks/custom-domains.md`; 0003 carries the dated
resolution update. Remaining before "live custom domains": Phase 5.3
routing + TLS, which still needs a real base domain and DNS access
from the owner (Vercel token is in place, project-scoped).

**Can be done independently:** Yes, after the domain data model and host
resolver interface are stable.

- Allow an operator or owner to submit a custom domain according to
  the product's permission model.
- Define the ownership verification process.
- Prevent an unverified domain from being attached to an arbitrary
  tenant.
- Handle duplicate domain claims and removal safely.
- Provide clear DNS instructions and status messages.

**Deliverable:** Custom-domain verification flow.

## 5.3 SSL and production routing

**Status:** Done 2026-10-15 (`phase5`) for everything the API exposes;
the hosted wildcard verification (5.1's live half) still awaits the
base-domain decision. Vercel provisions and renews certificates
automatically via DNS-01 once a domain is attached and its DNS points
here; the API exposes **no certificate status**, so the platform
couples its own facts (project attach + Vercel `verified`) with a real
HTTPS probe (`src/lib/domain-routing.ts`): `live` is unreachable
unless all three hold — the 4.3 rule ("never call a domain live before
routing and TLS do") is now one pure, truth-tabled function. Verifying
a 5.2 claim attaches the domain automatically; removal detaches
best-effort (the resolver already stopped honoring it, so a failure is
stated, never blocking); a routing-status check reports
pending/live/detached in plain words. Config is server-side only
(`VERCEL_TOKEN` project-scoped + `VERCEL_PROJECT_ID`); without it
routing fails closed while claims and verification keep working.
Verification: 29 unit tests on injected fakes (including the truth
table and "the token never appears in a message"), and a live
round-trip through the app's own client against the real project —
attach → read back → fold says _pending_ (never live) → detach →
gone; the project's domain list was restored to its original shape
afterwards. Manual recovery steps for the common DNS failures are in
`docs/runbooks/custom-domains.md`.

**Can be done independently:** Partially. Application state can be
developed separately, but actual SSL provisioning depends on the hosting
provider.

- Confirm how the chosen host provisions and renews certificates.
- Track pending, active, and failed states if the provider exposes
  them.
- Do not claim a domain is live until routing and HTTPS work.
- Document manual recovery steps for common DNS errors.

**Deliverable:** Verified HTTPS custom-domain flow, or a documented
manual process if full automation is not supported.

## 5.4 Domain lifecycle tests

**Can be done independently:** Yes, once 5.1 to 5.3 expose stable
interfaces.

Test: - Valid platform hostname. - Valid verified custom domain. -
Unknown hostname. - Unverified domain. - Duplicate domain claim. -
Domain removal or reassignment. - Failed or pending domain activation.

**Deliverable:** Automated routing/domain tests and support
documentation.

---

# Phase 6: Pilot readiness and operational hardening

**Goal:** Make the product safe and reliable enough for a small group of
real customers.

**Exit criteria:** Core journeys work in the target environment,
important security boundaries are tested, and the operator can support
the pilot.

## 6.1 Security review

- Review authentication, role checks, tenant isolation, public data
  exposure, uploads, and domain verification.
- Test unauthorised access by changing resource IDs.
- Check secrets and environment configuration.
- Review dependency warnings and vulnerable packages.
- Fix critical and high-impact issues before onboarding customers.

**Deliverable:** Security checklist with issues and resolutions.

## 6.2 Reliability and error handling

- Handle database and storage failures gracefully.
- Avoid leaking internal errors to visitors.
- Add basic health checks and actionable server-side logging.
- Avoid logging secrets or private customer data.
- Document database backup and restore expectations.
- Verify that failures do not leave misleading publish/domain states.

**Deliverable:** Operational checklist and tested failure states.

## 6.3 Performance and accessibility

- Check mobile performance and image sizes.
- Avoid unnecessary client-side JavaScript.
- Check keyboard access, labels, contrast, headings, and semantic
  structure.
- Test long restaurant names, long menu descriptions, missing images,
  and large menus.

**Deliverable:** Fixed pilot-blocking UI and performance issues.

## 6.4 End-to-end regression

Test the complete journeys: 1. Operator creates a restaurant. 2. Owner
accesses the correct tenant. 3. Owner edits restaurant details and menu. 4. Owner chooses a theme and previews. 5. Owner publishes changes. 6.
Public visitor sees only the published content on the correct hostname. 7. A different tenant cannot access the first tenant's private content. 8. Errors and invalid input are handled clearly.

**Deliverable:** Repeatable regression suite and results.

## 6.5 Deployment and support documentation

- Document environment variables, deployment steps, migrations, and
  rollback considerations.
- Document how to create a tenant, configure its content, connect a
  domain, and troubleshoot common problems.
- Establish a basic process for reporting and resolving customer
  issues.

**Deliverable:** Pilot runbook.

---

# Phase 7: Pilot launch and feedback

**Goal:** Validate whether restaurants will use and pay for the product
before expanding the feature set.

**Exit criteria:** A small pilot has produced concrete feedback and
evidence to guide the next iteration.

## 7.1 Prepare demo restaurants

- Create synthetic demo content for two or three restaurant styles.
- Check menus, mobile layouts, links, hours, contact details, and
  theme consistency.
- Clearly label demo/sample data.
- Do not publish invented testimonials or imply that demo businesses
  are real customers.

**Deliverable:** Reliable demo websites.

## 7.2 Onboard a small pilot group

- Aim for two or three willing pilot restaurants, subject to finding
  interested businesses.
- Record the time and assistance required to onboard each one.
- Keep a list of setup friction, missing information, and customer
  questions.
- Obtain permission before using real logos, images, or customer
  information in demos or marketing.

**Deliverable:** Pilot onboarding notes.

## 7.3 Collect and prioritise feedback

Ask pilot users about: - Whether the site looks credible and suits their
business. - Whether visitors can find the menu and contact details
quickly. - Whether owners can update the menu without assistance. - What
was confusing during setup. - What they would pay for and what they
expect to be included. - Which missing feature is genuinely blocking
adoption.

Prioritise evidence of customer value, not the number of feature
requests.

**Deliverable:** Prioritised backlog based on observed usage and
feedback.

## 7.4 Decide the next release

Choose whether to focus on: - Easier onboarding and menu entry. - Better
themes and visual polish. - Domain setup automation. - Content import or
menu migration. - Reliability and operator tooling. - A separately
validated future feature such as online ordering.

Do not begin a major feature solely because it is common in competing
products. Validate the customer need and business model first.

**Deliverable:** A short next-release plan.

---

# Phase 8: Optional post-MVP features

These are intentionally outside the initial delivery commitment. Each
requires a separate product decision, acceptance criteria, and estimate.

Possible candidates: - Menu import from PDF, image, or an existing
website. - QR-code menu pages. - Basic visitor analytics. -
Search-engine metadata and structured data. - Special opening hours and
holiday schedules. - Multiple languages. - Online ordering and payment
integration. - Reservations. - POS or delivery platform integrations. -
More themes or brand customisation.

Do not build these until the pilot indicates which ones matter.

---

# Cross-phase engineering work

These concerns apply throughout the project rather than belonging to a
single phase.

## Security and tenant isolation

- Every protected operation requires server-side authorisation.
- Every tenant-owned query is scoped to the authorised tenant.
- Negative cross-tenant tests are mandatory for tenant-sensitive
  changes.
- Public pages must never expose draft or private owner data.

## Data migrations

- Use versioned migrations.
- Never reset a production database to make a migration work.
- Review destructive changes and obtain explicit approval before
  running them against valuable data.
- Test migration paths on a development database.

## Quality gates

Before merging or marking a feature complete, run the relevant available
commands for: - Tests. - Lint. - Type checking. - Build. - Migration
validation, when schema changes are involved.

Record commands and results accurately.

## Documentation

Keep these documents updated as the project evolves: - `README.md`:
setup and common commands. - `AGENTS.md`: standing agent rules. -
`ROADMAP.md`: phase and subphase status. - `docs/product-scope.md`:
agreed MVP scope and exclusions. - `docs/decisions/`: major architecture
decisions. - `docs/runbooks/`: deployment, onboarding, and
troubleshooting.

---

# Suggested initial task breakdown

After the repository audit, a practical first batch is:

1.  **Audit and decisions:** inspect the repository, record current
    state, confirm the MVP scope, and propose architecture decisions.
2.  **Project setup:** ensure the app can be run, checked, and tested
    reproducibly.
3.  **Data model proposal:** design the minimum tenant, membership,
    restaurant profile, hours, menu category, and menu item model.
4.  **Tenant/security design:** agree on authentication, tenant context,
    and server-side access enforcement.
5.  **UI foundation:** establish reusable accessible components without
    building all screens.

These tasks can be investigated in parallel, but integration should be
deliberate. Do not allow independent agents to invent conflicting schema
fields, auth assumptions, route patterns, or public content contracts.

The first implementation milestone should be **a small, secure vertical
slice**: a development tenant can be resolved, its public restaurant
page renders sample published data, and automated tests prove that the
page cannot accidentally show another tenant's data.

Only then expand into the full owner dashboard and operator workflows.
