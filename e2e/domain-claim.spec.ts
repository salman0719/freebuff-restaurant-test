/**
 * Custom-domain claim journey (Phase 5.2), through the browser an owner
 * actually uses. Drives the real UI against the production build: record
 * a domain, read the TXT instructions, run a check, switch the domain,
 * refuse a neighbour's domain, and remove it behind its confirm step.
 *
 * The check runs against REAL DNS, so the observed outcome depends on
 * the network: an absent record reports "not seen yet", and a resolver
 * that cannot answer at all reports "could not query DNS" — both honest
 * failures. The invariant this pins is the one that must never vary:
 * without the TXT record, the domain never becomes verified.
 *
 * The fixture is fully disposable (`seedTenantWithOwner`): the spec owns
 * its tenant, user, and session, so it never races the owner journey's
 * shared fixture when Playwright runs files in parallel.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { expect, test } from "@playwright/test";
import { tenants } from "../db/schema";
import {
  SESSION_COOKIE,
  createSession,
  deleteTenantBySlug,
  deleteUserByEmail,
  findUserIdByEmail,
  seedTenantWithOwner,
} from "./helpers";

/** Claim a domain straight through the database — for the neighbour whose
 * only job in the spec is to hold a domain, so the flow under test can be
 * refused. One connection, always closed. */
async function claimDomainDirectly(slug: string, domain: string): Promise<void> {
  const client = postgres(process.env.DATABASE_URL as string, { max: 1 });
  const db = drizzle(client);
  try {
    await db
      .update(tenants)
      .set({
        customDomain: domain,
        customDomainStatus: "pending",
        customDomainVerifyToken: "neighbour-token",
      })
      .where(eq(tenants.slug, slug));
  } finally {
    await client.end();
  }
}

test.describe("custom domain claim (5.2)", () => {
  const stamp = Date.now().toString(36);
  const slug = `dcl-e2e-${stamp}`;
  const email = `dcl-e2e-${stamp}@example.com`;
  const domain = `shop-dcl-${stamp}.example.com`;
  const switchedDomain = `cafe-dcl-${stamp}.example.com`;
  let sessionToken = "";

  test.beforeAll(async () => {
    await seedTenantWithOwner(slug, email);
    sessionToken = await createSession(await findUserIdByEmail(email));
  });

  test.afterAll(async () => {
    await deleteTenantBySlug(slug);
    await deleteUserByEmail(email);
  });

  test("records, checks, switches, and removes a claim", async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: SESSION_COOKIE, value: sessionToken, domain: "localhost", path: "/" }]);

    await page.goto(`/dashboard/${slug}/domain`);
    await expect(page.getByRole("heading", { name: "Domain", level: 1 })).toBeVisible();

    // Record the claim.
    await page.getByRole("textbox", { name: "Domain" }).fill(domain);
    await page.getByRole("button", { name: "Record domain" }).click();

    // Pending state: the banner says it is not verified, and the exact
    // TXT record to publish is spelled out.
    await expect(page.getByText("is recorded but not verified yet")).toBeVisible();
    await expect(page.getByText(`_restaurant-platform.${domain}`)).toBeVisible();

    // Check against real DNS. No such record exists, so the answer is a
    // failure of one of the two honest kinds — never "verified":
    // "not seen yet" (resolver answered, no record) or "could not query"
    // (resolver unreachable; some home routers refuse TXT lookups).
    await page.getByRole("button", { name: /check now/i }).click();
    await expect(page.getByText(/Not seen yet|Could not query the domain's DNS/i)).toBeVisible();
    await expect(page.getByText(/is verified/)).toHaveCount(0);

    // Switching domains restarts verification with a fresh record.
    await page.getByRole("textbox", { name: "Domain" }).fill(switchedDomain);
    await page.getByRole("button", { name: "Use a different domain" }).click();
    await expect(page.getByText(`_restaurant-platform.${switchedDomain}`)).toBeVisible();

    // Removal is two-step, then confirms — and the confirmation lands in
    // the empty phase, where the claim used to be.
    await page.getByRole("button", { name: "Remove domain…" }).click();
    await page.getByRole("button", { name: "Confirm removal" }).click();
    await expect(page.getByText("Domain removed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Record domain" })).toBeVisible();
  });

  test("refuses a domain another restaurant already holds", async ({ page }) => {
    // A neighbour tenant holds `domain` (still present: the fixture's
    // cleanup runs after this test too). Recording it here must be
    // refused and keyed to the field.
    const neighbourSlug = `dcl-nbr-${stamp}`;
    const neighbourEmail = `dcl-nbr-${stamp}@example.com`;
    await seedTenantWithOwner(neighbourSlug, neighbourEmail);
    try {
      await claimDomainDirectly(neighbourSlug, domain);

      await page
        .context()
        .addCookies([
          { name: SESSION_COOKIE, value: sessionToken, domain: "localhost", path: "/" },
        ]);
      await page.goto(`/dashboard/${slug}/domain`);
      await page.getByRole("textbox", { name: "Domain" }).fill(domain);
      await page.getByRole("button", { name: "Record domain" }).click();
      await expect(
        page.getByText("That domain already points at another restaurant.")
      ).toBeVisible();
    } finally {
      await deleteTenantBySlug(neighbourSlug);
      await deleteUserByEmail(neighbourEmail);
    }
  });
});
