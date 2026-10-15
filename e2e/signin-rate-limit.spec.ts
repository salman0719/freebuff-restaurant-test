/**
 * Sign-in rate limiting end to end (Phase 6.1, finding F3).
 *
 * The unit suite pins the decision and the live suite pins the atomic
 * increment; this one proves the wiring the finding is actually about — a real
 * browser posting the real form spends a real budget, the fourth attempt is
 * refused, and that fourth attempt reaches no mail server at all. It runs
 * against the production build like the rest of the suite, so a limit that
 * only existed in the test process would fail here.
 *
 * The addresses are disposable and unique to the run, so neither a previous
 * run nor the parallel sign-in journey can be confused for this one; the
 * reset and purge in `beforeAll` make a Playwright retry start clean too.
 */
import { expect, test, type Page } from "@playwright/test";
import { countMessagesTo, purgeMailpitFor, resetSigninRateLimit } from "./helpers";

/** Unique per run: the limiter's bucket is keyed by the address. */
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** The address that spends its budget, and one that must be unaffected by it. */
const SPENT = `ratelimit-spent-${RUN}@example.com`;
const BLOCKED = `ratelimit-blocked-${RUN}@example.com`;
const FRESH = `ratelimit-fresh-${RUN}@example.com`;
const ADDRESSES = [SPENT, BLOCKED, FRESH];

/**
 * The source bucket a header-less local stack derives from a loopback
 * connection. Shared with every other spec, so this file clears it as well:
 * nine requests per run against a limit of twenty would otherwise refuse the
 * next run's sign-in for a reason that has nothing to do with what it asserts.
 */
const LOOPBACK_SOURCES = ["::1", "127.0.0.1"];

/**
 * Read the limit from the limiter itself rather than repeating it, so tuning
 * the pilot default cannot silently make this spec assert the wrong number.
 */
let maxAttempts: number;

test.beforeAll(async () => {
  const { SIGNIN_RATE_LIMITS } = await import("../src/lib/signin-rate-limit");
  maxAttempts = SIGNIN_RATE_LIMITS.email.max;
  expect(maxAttempts).toBeGreaterThan(1);
  for (const address of ADDRESSES) {
    await resetSigninRateLimit(address);
    await purgeMailpitFor(address);
  }
  for (const source of LOOPBACK_SOURCES) {
    await resetSigninRateLimit(source, ["ip"]);
  }
});

test.afterAll(async () => {
  // Leave no counter or mail behind for the next run of this file.
  for (const address of ADDRESSES) {
    await resetSigninRateLimit(address);
    await purgeMailpitFor(address);
  }
  for (const source of LOOPBACK_SOURCES) {
    await resetSigninRateLimit(source, ["ip"]);
  }
});

/** Post the login form the way a person does; returns once the click is in. */
async function requestLink(page: Page, address: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email address/i).fill(address);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
}

/** Request links until the limiter refuses — the last attempt is the refused one. */
async function spendBudget(page: Page, address: string): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await requestLink(page, address);
    await page.waitForURL(/verify-request/);
  }
}

/**
 * The refusal as the person sees it: an inline error on the login page that
 * says when to come back, never a redirect to the "check your email" page and
 * never a claim that a link was sent.
 */
async function expectRefusal(page: Page): Promise<void> {
  // Scoped to the form: Next's route announcer is also role="alert", and an
  // unscoped locator resolves to both elements (strict-mode violation).
  const alert = page.locator("form[action]").getByRole("alert");
  await expect(alert).toContainText(/too many sign-in attempts/i);
  await expect(alert).toContainText(/wait about \d+ minutes?/i);
  await expect(page).toHaveURL(/\/login/);
}

test("refuses the sign-in link past the limit without sending the mail", async ({ page }) => {
  test.setTimeout(180_000);

  await spendBudget(page, SPENT);
  await expect.poll(() => countMessagesTo(SPENT)).toBe(maxAttempts);

  // One past the limit: same form, same address, no link.
  await requestLink(page, SPENT);
  await expectRefusal(page);

  // The finding itself: the refused attempt sends nothing. An absence can only
  // be observed by waiting past the point where delivery would have happened
  // had the send path been reached — the limit is read BEFORE `signIn`.
  await page.waitForTimeout(3_000);
  expect(await countMessagesTo(SPENT)).toBe(maxAttempts);
});

test("a limited address does not lock out another one", async ({ page }) => {
  test.setTimeout(180_000);

  await spendBudget(page, BLOCKED);
  await requestLink(page, BLOCKED);
  await expectRefusal(page);

  // A different person on the same origin is unaffected: the bucket is the
  // address, so refusing one must never become a platform-wide lockout.
  await requestLink(page, FRESH);
  await page.waitForURL(/verify-request/);
  await expect.poll(() => countMessagesTo(FRESH)).toBe(1);
});
