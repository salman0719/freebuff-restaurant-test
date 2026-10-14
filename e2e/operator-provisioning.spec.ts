/**
 * Operator provisioning (Phase 4.2) against the real stack.
 *
 * The unit suite proves the rules through an injected store; this proves the
 * journey an operator actually walks — create a restaurant from the form,
 * follow the link to its page, grant the owner access — and, just as
 * importantly, the refusals: a duplicate address, a second grant, an invalid
 * address, and an ordinary owner kept out of the whole surface.
 *
 * Two habits this spec keeps, both learned the hard way:
 *
 * - **Every test creates the fixture it needs.** Sharing a restaurant across
 *   tests makes the file order-dependent, and a failure in one test then
 *   reads as a failure of the next.
 * - **Assertions are scoped to a region, never to bare text.** A `role="status"`
 *   message and a badge can both contain "takeaway theme", and `toHaveURL`
 *   resolves while the previous page is still mounted, so a loose text match
 *   reports a strict-mode violation against a page that is actually correct.
 *
 * It also seeds its OWN platform-staff address, because `seedOperator`
 * deletes and re-inserts the shared row and Playwright runs files in
 * parallel; and it cleans up after itself, because global setup only resets
 * the owner-journey fixture.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import {
  E2E_EMAIL,
  SESSION_COOKIE,
  createSession,
  deleteTenantBySlug,
  deleteUserByEmail,
  findUserIdByEmail,
  getGlobalRole,
  seedOperatorUser,
} from "./helpers";

const APP = "http://localhost:4030";
const OPERATOR_EMAIL = "provisioning-staff-e2e@example.com";
const OWNER_MAIN = "provisioned-owner-e2e@example.com";
const OWNER_GRANT = "provisioned-grant-e2e@example.com";
const NOT_FOUND_HEADING = /couldn't find that page/i;

/** Slugs this spec creates, all removed in `afterAll`. */
const SLUGS = ["e2e-prov-main", "e2e-prov-dup", "e2e-prov-grant", "e2e-prov-list"] as const;
const [SLUG_MAIN, SLUG_DUP, SLUG_GRANT, SLUG_LIST] = SLUGS;

let operatorToken = "";
let ownerToken = "";

async function signInAs(context: BrowserContext, token: string): Promise<void> {
  await context.addCookies([
    { name: SESSION_COOKIE, value: token, url: APP, httpOnly: true, sameSite: "Lax" },
  ]);
}

/**
 * The service error panel, narrowed to one carrying `pattern`. Filtering by
 * text is deliberate: a `div[role="alert"]` takes no accessible name from its
 * content, so `getByRole("alert", { name })` can never match it, and an
 * unfiltered query also catches the inline field error and Next's route
 * announcer.
 */
function errorPanel(page: import("@playwright/test").Page, pattern: RegExp) {
  return page.getByRole("alert").filter({ hasText: pattern }).first();
}

/** Fill the create form and submit it. */
async function createRestaurant(
  page: import("@playwright/test").Page,
  slug: string,
  name: string,
  theme?: string
): Promise<void> {
  await page.goto("/operator/tenants/new");
  await page.getByLabel("Address").fill(slug);
  await page.getByLabel("Restaurant name").fill(name);
  if (theme) {
    await page.getByLabel(/default theme/i).selectOption(theme);
  }
  await page.getByRole("button", { name: /create restaurant/i }).click();
}

test.beforeAll(async () => {
  operatorToken = await createSession(await seedOperatorUser(OPERATOR_EMAIL));
  // An ordinary owner: the account the operator surface refuses to promote.
  // The journey fixture belongs to global setup, so this is only a read.
  ownerToken = await createSession(await findUserIdByEmail(E2E_EMAIL));
  // A previous run may have been interrupted partway through.
  for (const slug of SLUGS) await deleteTenantBySlug(slug);
  await deleteUserByEmail(OWNER_MAIN);
  await deleteUserByEmail(OWNER_GRANT);
});

test.afterAll(async () => {
  for (const slug of SLUGS) await deleteTenantBySlug(slug);
  await deleteUserByEmail(OWNER_MAIN);
  await deleteUserByEmail(OWNER_GRANT);
  await deleteUserByEmail(OPERATOR_EMAIL);
});

test("an ordinary owner cannot reach the setup flow", async ({ page, context }) => {
  await signInAs(context, ownerToken);
  for (const path of ["/operator/tenants/new", `/operator/tenants/${SLUG_MAIN}`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: NOT_FOUND_HEADING })).toBeVisible();
    await expect(page.getByRole("heading", { name: /new restaurant/i })).toHaveCount(0);
    await expect(page.getByText(/owner access/i)).toHaveCount(0);
  }
});

test("refuses an invalid address before creating anything", async ({ page, context }) => {
  await signInAs(context, operatorToken);
  await createRestaurant(page, "Not A Valid Slug", "Never Created");
  await expect(errorPanel(page, /lowercase letters, digits, and single hyphens/i)).toBeVisible();
  // Nothing was created, so the address is still free.
  await page.goto(`/operator/tenants/${SLUG_MAIN}`);
  await expect(page.getByRole("heading", { name: NOT_FOUND_HEADING })).toBeVisible();
});

test("creates a restaurant, then assigns its owner", async ({ page, context, browser }) => {
  await signInAs(context, operatorToken);
  // "Publish immediately" is left alone: a new restaurant starts as a draft.
  await createRestaurant(page, SLUG_MAIN, "E2E Provisioned Kitchen", "takeaway");

  const created = page.getByRole("status");
  await expect(created).toContainText(`Created ${SLUG_MAIN}`);
  await expect(created).toContainText(/draft site with the takeaway theme/i);

  await page.getByRole("link", { name: /assign its owner/i }).click();
  await expect(page).toHaveURL(new RegExp(`/operator/tenants/${SLUG_MAIN}$`));
  // Waiting for the invite form proves the detail page has finished rendering,
  // so the assertions below cannot read the previous page's leftovers.
  await expect(page.getByLabel(/owner's email/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Provisioned Kitchen" })).toBeVisible();
  // The chosen theme travelled with it, and it is still a draft. Scoped to the
  // status badges: the checklist below reports "Draft" for publishing too.
  const status = page.getByRole("group", { name: /restaurant status/i });
  await expect(status).toContainText("Takeaway theme");
  await expect(status).toContainText("Draft");

  await page.getByLabel(/owner's email/i).fill(OWNER_MAIN);
  await page.getByRole("button", { name: /grant owner access/i }).click();
  await expect(page.getByRole("status")).toContainText(`Invited ${OWNER_MAIN}`);

  // An invite creates the account on the platform DEFAULT role. If
  // provisioning could write a stronger one, this is where it would show.
  expect(await getGlobalRole(await findUserIdByEmail(OWNER_MAIN))).toBe("owner");

  // The invited owner can actually open a dashboard listing this restaurant.
  // That is the whole point of granting access, and it proves the membership
  // is real rather than cosmetic — while the operator above has no membership
  // of their own and would still see an empty list.
  const invitedContext = await browser.newContext();
  try {
    await signInAs(invitedContext, await createSession(await findUserIdByEmail(OWNER_MAIN)));
    const ownerView = await invitedContext.newPage();
    await ownerView.goto("/dashboard");
    await expect(ownerView.getByRole("heading", { name: new RegExp(SLUG_MAIN) })).toBeVisible();
    await expect(ownerView.getByText(/no restaurants yet/i)).toHaveCount(0);
  } finally {
    await invitedContext.close();
  }
});

test("refuses a duplicate address", async ({ page, context }) => {
  await signInAs(context, operatorToken);
  await createRestaurant(page, SLUG_DUP, "First Claim");
  await expect(page.getByRole("status")).toContainText(`Created ${SLUG_DUP}`);

  // Same address, someone else's name: the address is the tenant's identity.
  await createRestaurant(page, SLUG_DUP, "Second Claim");
  await expect(errorPanel(page, /already exists/i)).toBeVisible();
});

test("reports a second grant for the same person as a conflict", async ({ page, context }) => {
  await signInAs(context, operatorToken);
  await createRestaurant(page, SLUG_GRANT, "Grant Kitchen");
  await expect(page.getByRole("status")).toContainText(`Created ${SLUG_GRANT}`);

  await page.goto(`/operator/tenants/${SLUG_GRANT}`);
  await page.getByLabel(/owner's email/i).fill(OWNER_GRANT);
  await page.getByRole("button", { name: /grant owner access/i }).click();
  await expect(page.getByRole("status")).toContainText(`Invited ${OWNER_GRANT}`);

  // The checklist reflects it: a granted owner clears that step, which is what
  // makes the status view worth reading rather than a static description.
  await page.goto(`/operator/tenants/${SLUG_GRANT}`);
  const setup = page.getByRole("region", { name: /setup status/i });
  await expect(setup).toContainText("1 person");
  await expect(setup).not.toContainText("No owner assigned");

  await page.getByLabel(/owner's email/i).fill(OWNER_GRANT);
  await page.getByRole("button", { name: /grant owner access/i }).click();
  await expect(errorPanel(page, /already has access/i)).toBeVisible();
});

test("shows an operator what a new restaurant still needs", async ({ page, context }) => {
  await signInAs(context, operatorToken);
  await createRestaurant(page, SLUG_LIST, "Checklist Kitchen");
  await expect(page.getByRole("status")).toContainText(`Created ${SLUG_LIST}`);

  // The console lists it, with the gaps that actually block a usable site.
  await page.goto("/operator");
  const card = page.locator("li", { hasText: SLUG_LIST }).first();
  await expect(card).toContainText("2/7 set");
  await expect(card).toContainText(/needs menu entered, opening hours, owner access/i);

  // The detail view carries the full checklist, not just the blocking half.
  await card.getByRole("link", { name: "Checklist Kitchen" }).click();
  await expect(page).toHaveURL(new RegExp(`/operator/tenants/${SLUG_LIST}$`));
  const setup = page.getByRole("region", { name: /setup status/i });
  await expect(setup).toContainText("4 required steps still outstanding");
  await expect(setup).toContainText("Nothing visible to visitors yet");
  await expect(setup).toContainText("Not entered");
  await expect(setup).toContainText("No owner assigned");
  // A theme is reported, and a custom domain is optional — neither blocks.
  await expect(setup).toContainText("Café");
  await expect(setup).toContainText("Platform address only");
  await expect(setup).toContainText("(optional)");
  // The domain is reported as recorded, never as live: verification is Phase 5.
  await expect(setup).not.toContainText(/domain (is )?(live|verified|active)/i);
});

test("keeps a non-staff caller from learning about a restaurant", async ({ page, context }) => {
  // The same page as an unknown route: an owner learns neither that the
  // console exists nor whether that restaurant does.
  await signInAs(context, ownerToken);
  await page.goto("/operator/tenants/no-such-restaurant-anywhere");
  await expect(page.getByRole("heading", { name: NOT_FOUND_HEADING })).toBeVisible();
  await expect(page.getByText(/owner access/i)).toHaveCount(0);
});
