/**
 * Public tenant isolation (Phase 6.4): exercise hostname routing and
 * publication in a real browser, then prove one tenant's owner session
 * cannot open another tenant's private dashboard.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { expect, test, type BrowserContext } from "@playwright/test";
import {
  memberships,
  menuCategories,
  menuItems,
  restaurantProfiles,
  tenants,
  users,
} from "../db/schema";
import { createSession, deleteTenantBySlug, deleteUserByEmail, SESSION_COOKIE } from "./helpers";

const APP = "http://localhost:4030";
const NOT_FOUND = /couldn.t find that page/i;

const suffix = randomUUID().slice(0, 8);
const slugA = `regression-a-${suffix}`;
const slugB = `regression-b-${suffix}`;
const emailA = `regression-a-${suffix}@example.com`;
const nameA = `Regression Restaurant A ${suffix}`;
const nameB = `Regression Restaurant B ${suffix}`;
const privateDescriptionB = `private-draft-description-${suffix}`;
const itemA = `Public dish A ${suffix}`;
const itemB = `Draft dish B ${suffix}`;
let ownerASession = "";

async function signInAs(context: BrowserContext, token: string): Promise<void> {
  await context.addCookies([
    { name: SESSION_COOKIE, value: token, url: APP, httpOnly: true, sameSite: "Lax" },
  ]);
}

async function seedFixtures(): Promise<void> {
  const client = postgres(process.env.DATABASE_URL as string, { max: 1 });
  const db = drizzle(client);
  try {
    const [tenantA, tenantB] = await db
      .insert(tenants)
      .values([
        { slug: slugA, published: true },
        { slug: slugB, published: false },
      ])
      .returning({ id: tenants.id, slug: tenants.slug });
    const idA = tenantA.slug === slugA ? tenantA.id : tenantB.id;
    const idB = tenantA.slug === slugB ? tenantA.id : tenantB.id;

    await db.insert(restaurantProfiles).values([
      { tenantId: idA, name: nameA, description: `public-description-${suffix}` },
      { tenantId: idB, name: nameB, description: privateDescriptionB },
    ]);
    const [categoryA, categoryB] = await db
      .insert(menuCategories)
      .values([
        { tenantId: idA, name: `Category A ${suffix}` },
        { tenantId: idB, name: `Category B ${suffix}` },
      ])
      .returning({ id: menuCategories.id, tenantId: menuCategories.tenantId });
    const idForCategoryA = categoryA.tenantId === idA ? categoryA.id : categoryB.id;
    const idForCategoryB = categoryA.tenantId === idB ? categoryA.id : categoryB.id;
    await db.insert(menuItems).values([
      { tenantId: idA, categoryId: idForCategoryA, name: itemA, priceCents: 1250 },
      { tenantId: idB, categoryId: idForCategoryB, name: itemB, priceCents: 1450 },
    ]);

    const [ownerA] = await db.insert(users).values({ email: emailA }).returning({ id: users.id });
    await db.insert(memberships).values({ userId: ownerA.id, tenantId: idA, role: "owner" });
    ownerASession = await createSession(ownerA.id);
  } finally {
    await client.end();
  }
}

test.describe("public tenant isolation (6.4)", () => {
  test.beforeAll(async () => {
    await seedFixtures();
  });

  test.afterAll(async () => {
    await deleteTenantBySlug(slugA);
    await deleteTenantBySlug(slugB);
    await deleteUserByEmail(emailA);
  });

  test("serves only the requested tenant and hides drafts and foreign private content", async ({
    browser,
  }) => {
    const visitor = await browser.newPage();
    try {
      const publishedResponse = await visitor.goto(`http://${slugA}.localhost:4030/`);
      expect(publishedResponse?.status()).toBe(200);
      await expect(visitor.getByRole("heading", { name: nameA, exact: true })).toBeVisible();
      await expect(visitor.getByText(itemA)).toBeVisible();
      await expect(visitor.getByText(nameB, { exact: true })).toHaveCount(0);
      await expect(visitor.getByText(itemB, { exact: true })).toHaveCount(0);

      // Unknown and unpublished tenants produce the same generic page, never
      // the draft's profile, description, or menu content.
      await visitor.goto(`http://${slugB}.localhost:4030/`);
      await expect(visitor.getByRole("heading", { name: NOT_FOUND, exact: true })).toBeVisible();
      await expect(visitor.getByText(privateDescriptionB, { exact: true })).toHaveCount(0);
      await expect(visitor.getByText(itemB, { exact: true })).toHaveCount(0);
      const draftHeading = await visitor.getByRole("heading", { level: 1 }).textContent();

      await visitor.goto(`http://unknown-${suffix}.localhost:4030/`);
      await expect(visitor.getByRole("heading", { name: NOT_FOUND, exact: true })).toBeVisible();
      expect(await visitor.getByRole("heading", { level: 1 }).textContent()).toBe(draftHeading);
      await expect(visitor.getByText(privateDescriptionB, { exact: true })).toHaveCount(0);

      // Membership is tenant-specific: owner A can open A, but the same
      // signed-in session learns no private profile details for B.
      const owner = await browser.newPage();
      try {
        await signInAs(owner.context(), ownerASession);
        await owner.goto(`/dashboard/${slugA}/profile`);
        await expect(owner.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
        await owner.goto(`/dashboard/${slugB}/profile`);
        await expect(owner.getByRole("heading", { name: NOT_FOUND, exact: true })).toBeVisible();
        await expect(owner.getByText(privateDescriptionB, { exact: true })).toHaveCount(0);
      } finally {
        await owner.close();
      }

      // Publishing B makes only B's content visible on B's hostname; A's
      // hostname remains scoped. Then unpublishing B hides it again.
      const client = postgres(process.env.DATABASE_URL as string, { max: 1 });
      const db = drizzle(client);
      try {
        await db.update(tenants).set({ published: true }).where(eq(tenants.slug, slugB));
      } finally {
        await client.end();
      }
      await visitor.goto(`http://${slugB}.localhost:4030/`);
      await expect(visitor.getByRole("heading", { name: nameB, exact: true })).toBeVisible();
      await expect(visitor.getByText(itemB)).toBeVisible();
      await expect(visitor.getByText(itemA, { exact: true })).toHaveCount(0);
      await visitor.goto(`http://${slugA}.localhost:4030/`);
      await expect(visitor.getByRole("heading", { name: nameA, exact: true })).toBeVisible();
      await expect(visitor.getByText(itemB, { exact: true })).toHaveCount(0);

      const unpublishClient = postgres(process.env.DATABASE_URL as string, { max: 1 });
      const unpublishDb = drizzle(unpublishClient);
      try {
        await unpublishDb.update(tenants).set({ published: false }).where(eq(tenants.slug, slugB));
      } finally {
        await unpublishClient.end();
      }
      await visitor.goto(`http://${slugB}.localhost:4030/`);
      await expect(visitor.getByRole("heading", { name: NOT_FOUND, exact: true })).toBeVisible();
      await expect(visitor.getByText(itemB, { exact: true })).toHaveCount(0);
    } finally {
      await visitor.close();
    }
  });
});
