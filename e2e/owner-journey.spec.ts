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
import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_NAME, E2E_SLUG, fetchSignInLink, purgeMailpitFor } from "./helpers";

const dashboard = `/dashboard/${E2E_SLUG}`;
const publicSite = `http://${E2E_SLUG}.localhost:4030/`;

/** Server-action round-trips compile on first hit (dev) — allow room. */
const ACTION_TIMEOUT = 30_000;

// The journey drives a dozen pages plus a real email round-trip.
test.setTimeout(240_000);

test.beforeAll(async () => {
  await purgeMailpitFor(E2E_EMAIL);
});

test("owner signs in, edits, and publishes the restaurant site", async ({ page, browser }) => {
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

  // Profile: save public content and upload an actual image through the owner UI.
  await page.goto(`${dashboard}/profile`);
  await page.getByLabel(/restaurant name/i).fill(E2E_NAME);
  const logoBytes = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 170, g: 95, b: 40 } },
  })
    .png()
    .toBuffer();
  await page.getByLabel("Logo").setInputFiles({
    name: "owner-logo.png",
    mimeType: "image/png",
    buffer: logoBytes,
  });
  await page.getByRole("button", { name: /save profile/i }).click();
  await expect(page.getByRole("status")).toContainText(/profile saved/i, {
    timeout: ACTION_TIMEOUT,
  });
  await page.reload();
  const logoPreview = page.getByRole("img", { name: "Current restaurant logo" });
  await expect(logoPreview).toBeVisible();
  const logoUrl = await logoPreview.getAttribute("src");
  const logoImagePath = decodeURIComponent(
    new URL(logoUrl ?? "/", page.url()).searchParams.get("url") ?? ""
  );
  expect(logoImagePath).toContain("/api/images/");

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
  const publicLogo = page.getByRole("img", { name: `${E2E_NAME} logo` });
  await expect(publicLogo).toBeVisible();
  const srcSet = await publicLogo.getAttribute("srcset");
  expect(decodeURIComponent(srcSet ?? "")).toContain("/api/images/");
  const directImageUrl = new URL(logoImagePath, page.url());
  const logoResponse = await page.request.get(directImageUrl.toString());
  expect(logoResponse.ok()).toBe(true);
  expect(logoResponse.headers()["content-type"]).toBe("image/webp");
  expect(Number(logoResponse.headers()["content-length"])).toBeGreaterThan(0);
  const firstDeploymentLogo = Buffer.from(await logoResponse.body());

  // A freshly created browser context has no image cache. After the owner
  // navigates away, public delivery must still come from durable storage.
  const visitor = await browser.newPage();
  try {
    await visitor.goto(publicSite);
    const visitorLogo = visitor.getByRole("img", { name: `${E2E_NAME} logo` });
    await expect(visitorLogo).toBeVisible();
    const visitorImage = new URL(logoImagePath, visitor.url());
    const visitorResponse = await visitor.request.get(visitorImage.toString());
    expect(visitorResponse.ok()).toBe(true);
    expect(visitorResponse.headers()["content-type"]).toBe("image/webp");
    expect(Buffer.from(await visitorResponse.body())).toEqual(firstDeploymentLogo);
  } finally {
    await visitor.close();
  }

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
