/**
 * Owner input validation (Phase 6.4): invalid profile input must stay a
 * visible, recoverable validation error rather than a false success.
 *
 * This spec owns a disposable tenant and account so it can run alongside the
 * owner journey without sharing or mutating its fixture.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { expect, test, type BrowserContext } from "@playwright/test";
import { restaurantProfiles, tenants } from "../db/schema";
import {
  createSession,
  deleteTenantBySlug,
  deleteUserByEmail,
  findUserIdByEmail,
  seedTenantWithOwner,
  SESSION_COOKIE,
} from "./helpers";

const APP = "http://localhost:4030";
const suffix = randomUUID().slice(0, 8);
const slug = `owner-validation-${suffix}`;
const email = `owner-validation-${suffix}@example.com`;
const restaurantName = `Validated Kitchen ${suffix}`;
let sessionToken = "";

async function signInAs(context: BrowserContext): Promise<void> {
  await context.addCookies([
    { name: SESSION_COOKIE, value: sessionToken, url: APP, httpOnly: true, sameSite: "Lax" },
  ]);
}

async function profileCount(): Promise<number> {
  const client = postgres(process.env.DATABASE_URL as string, { max: 1 });
  const db = drizzle(client);
  try {
    const rows = await db
      .select({ tenantId: restaurantProfiles.tenantId })
      .from(restaurantProfiles)
      .where(eq(restaurantProfiles.tenantId, tenantId));
    return rows.length;
  } finally {
    await client.end();
  }
}

let tenantId = "";

test.describe("owner profile validation (6.4)", () => {
  test.beforeAll(async () => {
    await seedTenantWithOwner(slug, email);
    const client = postgres(process.env.DATABASE_URL as string, { max: 1 });
    const db = drizzle(client);
    try {
      const rows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
      if (!rows[0]) throw new Error(`Tenant fixture ${slug} was not created.`);
      tenantId = rows[0].id;
    } finally {
      await client.end();
    }
    const userId = await findUserIdByEmail(email);
    sessionToken = await createSession(userId);
  });

  test.afterAll(async () => {
    await deleteTenantBySlug(slug);
    await deleteUserByEmail(email);
  });

  test("shows an honest field error, preserves input, and saves after correction", async ({
    page,
    context,
  }) => {
    await signInAs(context);
    await page.goto(`/dashboard/${slug}/profile`);

    const name = page.getByLabel("Restaurant name");
    await name.fill("   ");
    await page.getByRole("button", { name: /save profile/i }).click();

    const form = page.locator("form");
    await expect(
      form.getByRole("alert").filter({ hasText: "Check the highlighted fields and try again." })
    ).toBeVisible();
    await expect(form.getByText("Restaurant name is required.")).toBeVisible();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveValue("   ");
    await expect(form.getByRole("status")).toHaveCount(0);
    expect(await profileCount()).toBe(0);

    await name.fill(restaurantName);
    await page.getByRole("button", { name: /save profile/i }).click();
    await expect(page.getByRole("status")).toContainText("Profile saved.");
    await expect(form.getByRole("alert")).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("Restaurant name")).toHaveValue(restaurantName);
  });
});
