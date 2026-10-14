/**
 * Operator access (Phase 4.1) against the real stack.
 *
 * The unit suite proves the gate's decision; this proves the deployed
 * behaviour of `/operator` for each kind of caller, including that no
 * request-supplied data can promote an owner:
 *
 * - anonymous → `/login?next=/operator`;
 * - signed-in owner → the same not-found page as an unknown route (the
 *   console's existence is never confirmed to them);
 * - forged role attempts (query string, headers) → still refused, and the
 *   stored role is untouched;
 * - platform staff → the console renders.
 *
 * Sessions are created directly in the database here rather than by
 * emailing a magic link twice: it keeps this spec independent of Mailpit
 * (so it cannot race the owner-journey spec's inbox purge), and the global
 * role is the exact thing under test. The staff user is created the way
 * production will create it — a `users.role` row — because the provisioning
 * UI is Phase 4.2.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import {
  E2E_EMAIL,
  SESSION_COOKIE,
  createSession,
  findUserIdByEmail,
  getGlobalRole,
  seedOperator,
} from "./helpers";

const APP = "http://localhost:4030";
const CONSOLE_HEADING = /operator console/i;
const NOT_FOUND_HEADING = /couldn't find that page/i;

let ownerId = "";
let ownerToken = "";
let operatorToken = "";

async function signInAs(context: BrowserContext, token: string): Promise<void> {
  await context.addCookies([
    { name: SESSION_COOKIE, value: token, url: APP, httpOnly: true, sameSite: "Lax" },
  ]);
}

test.beforeAll(async () => {
  // Read-only for the owner: global setup owns that fixture.
  ownerId = await findUserIdByEmail(E2E_EMAIL);
  ownerToken = await createSession(ownerId);
  operatorToken = await createSession(await seedOperator());
});

test("anonymous visitors are sent to sign in, never to the console", async ({ page }) => {
  await page.goto("/operator");
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)operator/);
  await expect(page.getByRole("button", { name: /email me a sign-in link/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: CONSOLE_HEADING })).toHaveCount(0);
});

test("a signed-in owner gets the not-found page, not the console", async ({ page, context }) => {
  await signInAs(context, ownerToken);
  await page.goto("/operator");
  await expect(page.getByRole("heading", { name: NOT_FOUND_HEADING })).toBeVisible();
  await expect(page.getByRole("heading", { name: CONSOLE_HEADING })).toHaveCount(0);
  await expect(page.getByText(/signed in as platform staff/i)).toHaveCount(0);
});

test("an owner cannot promote themselves with request data", async ({ page, context }) => {
  await signInAs(context, ownerToken);
  for (const attempt of ["/operator?role=operator", "/operator?next=/operator&staff=1"]) {
    await page.goto(attempt);
    await expect(page.getByRole("heading", { name: NOT_FOUND_HEADING })).toBeVisible();
    await expect(page.getByRole("heading", { name: CONSOLE_HEADING })).toHaveCount(0);
  }
  // The authority is the stored global role, and it did not move.
  expect(await getGlobalRole(ownerId)).toBe("owner");
});

test("forged staff headers do not grant access", async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-user-role": "operator",
      "x-auth-role": "operator",
      "x-operator": "true",
    },
  });
  await signInAs(context, ownerToken);
  const page = await context.newPage();
  await page.goto("/operator");
  await expect(page.getByRole("heading", { name: NOT_FOUND_HEADING })).toBeVisible();
  await expect(page.getByRole("heading", { name: CONSOLE_HEADING })).toHaveCount(0);
  await context.close();
});

test("platform staff reach the console", async ({ page, context }) => {
  await signInAs(context, operatorToken);
  await page.goto("/operator");
  await expect(page.getByRole("heading", { name: CONSOLE_HEADING })).toBeVisible();
  await expect(page.getByText(/signed in as platform staff/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: NOT_FOUND_HEADING })).toHaveCount(0);
});
