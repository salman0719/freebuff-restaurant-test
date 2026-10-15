/**
 * Owner journey (Phase 3.9): the full sign-in → edit → publish workflow
 * end to end against the real stack (Postgres, Mailpit, production
 * build). Each run starts from the seeded draft tenant (`global-setup`)
 * and ends unpublished, so re-runs are deterministic.
 *
 * Covers: magic-link sign-in via the real email, dashboard listing,
 * profile save, category + item creation, hours save, theme switch +
 * draft preview, publish, public site on the tenant subdomain, and
 * unpublish cleanup.
 */
import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_NAME, E2E_SLUG, fetchSignInLink, purgeMailpit } from "./helpers";

const dashboard = `/dashboard/${E2E_SLUG}`;
const publicSite = `http://${E2E_SLUG}.localhost:4030/`;

/** Server-action round-trips compile on first hit (dev) — allow room. */
const ACTION_TIMEOUT = 30_000;

// The journey drives a dozen pages plus a real email round-trip.
test.setTimeout(240_000);

test.beforeAll(async () => {
  await purgeMailpit();
});

test("owner signs in, edits, and publishes the restaurant site", async ({ page }) => {
  // Exactly one live sign-in form (the 3.9 stale-fallback regression).
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /email me a sign-in link/i })).toBeVisible();
  await expect(page.locator("form[action]")).toHaveCount(1);

  await page.getByLabel(/email address/i).fill(E2E_EMAIL);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  await page.waitForURL(/verify-request/);

  const signInLink = await fetchSignInLink(E2E_EMAIL);
  await page.goto(signInLink);
  await page.waitForURL("/dashboard");
  await expect(page.getByText(E2E_SLUG)).toBeVisible();

  await page.getByRole("link", { name: /open dashboard/i }).click();
  await page.waitForURL(dashboard);
  await expect(page.getByText(/only you can see it until it is published/i)).toBeVisible();

  // Profile: name the restaurant.
  await page.goto(`${dashboard}/profile`);
  await page.getByLabel(/restaurant name/i).fill(E2E_NAME);
  await page.getByRole("button", { name: /save profile/i }).click();
  await expect(page.getByRole("status")).toContainText(/profile saved/i, {
    timeout: ACTION_TIMEOUT,
  });

  // Menu: one category, one item inside it.
  await page.goto(`${dashboard}/menu`);
  await page.getByLabel(/category name/i).fill("Mains");
  await page.getByRole("button", { name: /add category/i }).click();
  await expect(page.getByRole("status")).toContainText(/Mains.*added/i, {
    timeout: ACTION_TIMEOUT,
  });
  // The list is server-rendered and `useActionState` doesn't refresh it:
  // reload to see the new row (a real user would navigate the same way).
  await page.reload();
  // exact: the dashboard nav's "Domain" item concatenates into text that
  // contains "…mains…", so a substring match is no longer unique.
  await expect(page.getByText("Mains", { exact: true })).toBeVisible();

  await page.goto(`${dashboard}/menu/items`);
  await page.getByLabel(/item name/i).fill("E2E Burger");
  await page.getByLabel(/^price/i).fill("12.50");
  await page.getByLabel(/category/i).selectOption({ label: "Mains" });
  await page.getByRole("button", { name: /add item/i }).click();
  await expect(page.getByRole("status")).toContainText(/E2E Burger.*added/i, {
    timeout: ACTION_TIMEOUT,
  });
  await page.reload();
  await expect(page.getByText("E2E Burger")).toBeVisible();

  // Hours: open Mondays 09:00–17:00.
  await page.goto(`${dashboard}/hours`);
  await page.locator('input[name="closed-1"]').uncheck();
  await page.locator('input[name="open-1"]').fill("09:00");
  await page.locator('input[name="close-1"]').fill("17:00");
  await page.getByRole("button", { name: /save hours/i }).click();
  await expect(page.getByRole("status")).toContainText(/opening hours saved/i, {
    timeout: ACTION_TIMEOUT,
  });

  // Theme: switch to Takeaway, then check the draft preview.
  await page.goto(`${dashboard}/theme`);
  await page.getByRole("button", { name: /use takeaway/i }).click();
  await expect(page.getByRole("button", { name: /use takeaway/i })).toHaveCount(0);
  await page.getByRole("link", { name: /preview site/i }).click();
  await page.waitForURL(`${dashboard}/theme/preview`);
  await expect(page.getByText(E2E_NAME).first()).toBeVisible();

  // Publish, then verify the live public site on the tenant subdomain.
  await page.goto(`${dashboard}/publishing`);
  await page.getByRole("button", { name: /publish site/i }).click();
  await expect(page.getByRole("status")).toContainText(/published|live/i, {
    timeout: ACTION_TIMEOUT,
  });

  await page.goto(publicSite);
  await expect(page.getByText(E2E_NAME).first()).toBeVisible();
  await expect(page.getByText("E2E Burger")).toBeVisible();
  await expect(page.getByText("Mains", { exact: true })).toBeVisible();

  // Cleanup: take the site back offline for the next run. The publish
  // controls render server-side, so reload for the fresh published state.
  await page.goto(`${dashboard}/publishing`);
  await page.getByRole("button", { name: /unpublish site/i }).click();
  await page.getByRole("button", { name: /confirm unpublish/i }).click();
  await expect(page.getByRole("status")).toContainText(/offline/i, {
    timeout: ACTION_TIMEOUT,
  });
  await page.reload();
  await expect(page.getByText(/public site is offline/i)).toBeVisible();
});
