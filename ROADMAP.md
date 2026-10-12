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

**Status:** In progress (draft in `docs/product-scope.md`; needs owner
confirmation; reservations confirmed post-MVP).

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

**Status:** In progress (stack recorded in
`docs/decisions/0001-app-stack.md`; open items in
`docs/decisions/0002-open-decisions.md`).

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

**Status:** In progress (`README.md` setup docs, `.env.example`, and
`npm run check` done; test runner and CI still pending).

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

**Can be done independently:** Yes, once the public view model and theme
identifiers are agreed.

- Create a typed theme registry.
- Ensure all themes receive the same validated public content model.
- Keep database queries and authorisation outside theme components.
- Provide a safe fallback for missing or invalid theme configuration.
- Do not support arbitrary customer-supplied code.

**Deliverable:** Theme interface and registry.

## 2.3 Theme A: clean café style

**Can be done independently:** Yes, after 2.2's interface is stable.

- Create a mobile-first café/restaurant design.
- Display logo, name, menu categories/items, hours, contact details,
  and location.
- Include empty states for optional fields.
- Ensure good readability and accessible contrast.

**Deliverable:** First complete theme.

## 2.4 Theme B: modern takeaway style

**Can be done independently:** Yes, in parallel with 2.3 once the theme
interface is stable.

- Create a visually distinct layout suitable for takeaway businesses.
- Reuse the same content model.
- Do not implement ordering or payment features.
- Keep all essential restaurant information available.

**Deliverable:** Second complete theme.

## 2.5 Theme C: optional additional style

**Can be done independently:** Yes, in parallel with other theme work if
time and quality permit.

- Build a third distinct style only if it provides meaningful variety.
- Prioritise polish and responsive behaviour over the number of
  themes.

**Deliverable:** Optional third theme.

## 2.6 Host and tenant resolution

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

## 3.1 Dashboard shell and navigation

**Can be done independently:** Yes, after the UI foundation and auth
route patterns are stable.

- Build a responsive dashboard layout.
- Show only navigation items allowed for the current role.
- Add clear empty, loading, and error states.
- Protect routes on the server.

**Deliverable:** Authenticated dashboard shell.

## 3.2 Restaurant profile editor

**Can be done independently:** Yes, after the data and validation
contracts are stable.

- Edit restaurant name, public contact details, address, and other
  agreed profile fields.
- Validate input on the server.
- Save only within the authorised tenant.
- Display success and failure feedback.

**Deliverable:** Tested profile editor.

## 3.3 Opening-hours editor

**Can be done independently:** Yes, once the opening-hours data model is
agreed.

- Support opening and closing times per day.
- Support closed days and clearly defined special cases, if included.
- Validate time ranges and avoid ambiguous representations.
- Render hours consistently on public themes.

**Deliverable:** Hours editor and public display integration.

## 3.4 Menu category management

**Can be done independently:** Yes, after menu contracts are stable.

- Create, edit, reorder, and deactivate or delete categories according
  to the agreed deletion rules.
- Handle categories containing menu items safely.
- Enforce tenant ownership on every operation.

**Deliverable:** Category management flow.

## 3.5 Menu item management

**Can be done independently:** Yes, after the menu category and item
contracts are stable.

- Create and edit item name, description, price, category, image, and
  availability/visibility if included in scope.
- Validate price representation and required fields.
- Handle missing or optional descriptions and images.
- Enforce tenant ownership.

**Deliverable:** Menu item management flow.

## 3.6 Logo and image upload

**Can be done independently:** Yes, after the storage provider and
upload contract are chosen.

- Upload and replace logos and menu/item images.
- Restrict file size and allowed file types.
- Store files safely and avoid trusting user-provided paths.
- Provide upload progress or clear feedback.
- Handle failed uploads and unused files appropriately.

**Deliverable:** Secure upload flow.

## 3.7 Theme selection and preview

**Can be done independently:** Yes, after the theme registry and draft
model are stable.

- Show available themes.
- Save the selected theme for the authorised restaurant.
- Preview the restaurant with draft content and the selected theme.
- Prevent another tenant's preview from being accessed.

**Deliverable:** Theme selection and private preview.

## 3.8 Draft and publish flow

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

## 3.9 Owner journey integration

**Can be done independently:** No, this integrates the dashboard
modules.

- Test sign-in, profile editing, hours editing, category/item
  management, theme selection, preview, and publishing.
- Check permission failures and cross-tenant attempts.
- Fix inconsistent states between the dashboard and public website.

**Deliverable:** End-to-end owner workflow.

### Phase 3 parallel work guidance

After shared data contracts are stable: - Agent A: profile and hours
editor. - Agent B: menu category/item screens. - Agent C: image upload,
once storage conventions are settled. - Agent D: dashboard shell and
accessibility checks.

Keep draft/publish and theme preview coordinated with the public data
service. Avoid parallel changes to the same form components or domain
schemas.

---

# Phase 4: Platform operator and onboarding

**Goal:** Let the platform operator configure and support customer
tenants without direct database editing.

**Exit criteria:** The operator can create a tenant, assign an owner,
choose a theme, and inspect its setup status.

## 4.1 Operator access and role protection

**Can be done independently:** Yes, after the role model is stable.

- Protect operator-only routes and actions on the server.
- Prevent ordinary restaurant owners from granting themselves operator
  privileges.
- Add tests for forbidden access.

**Deliverable:** Secure operator access.

## 4.2 Restaurant creation and configuration

**Can be done independently:** Yes, after tenant schema and auth
contracts are stable.

- Create a restaurant tenant with required fields.
- Assign or invite an owner using the selected authentication system.
- Select a default theme.
- Initialise safe default content and publishing state.
- Prevent duplicate or invalid tenant identifiers.

**Deliverable:** Operator tenant setup flow.

## 4.3 Onboarding checklist and status

**Can be done independently:** Yes, after the required setup states are
agreed.

Track only useful setup information, such as: - Restaurant profile
completed. - Menu entered. - Theme selected. - Owner access
configured. - Domain configured. - Website published.

**Deliverable:** Basic operator onboarding view.

## 4.4 Operator integration and auditability

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
