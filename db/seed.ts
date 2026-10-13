/**
 * Development seed (Phase 2.7): two published tenants with representative
 * content plus one unpublished draft that must never render publicly.
 *
 * Idempotent by slug — safe to re-run. Dev only: requires DATABASE_URL and
 * refuses production. Usage: `npm run db:seed`.
 *
 * Deliberately seeds NO users or memberships: owner assignment belongs to
 * the operator onboarding flow (Phase 4). Public pages need none.
 */
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Pick up `.env.local` so the script works without exported variables.
loadEnvConfig(process.cwd());
import { menuCategories, menuItems, openingHours, restaurantProfiles, tenants } from "./schema";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Start Postgres with `docker compose up -d` first.");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const seedDb = drizzle(client);

async function tenantId(slug: string): Promise<string | null> {
  const rows = await seedDb.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  return rows[0]?.id ?? null;
}

/**
 * Presentation options per demo tenant. Each theme validates these against
 * its own schema at render, so they only ever hold values that theme
 * understands. Deliberately distinct: the point of the demo set is to show
 * how different a tenant can look from the same content model.
 */
const mariosOptions = { accent: "espresso", menuLayout: "editorial", showHours: true };
const dragonOptions = { accent: "chili", menuLayout: "compact", showDescription: true };
const draftOptions = { accent: "terracotta", menuLayout: "grid", showHours: true };

async function seedMarios(): Promise<void> {
  const existing = await tenantId("marios-pizza");
  if (existing) {
    // Converge the look on re-run: presentation is part of the seed, so an
    // accidental theme change does not silently stick in a demo database.
    await seedDb
      .update(tenants)
      .set({ theme: "cafe", themeConfig: mariosOptions })
      .where(eq(tenants.id, existing));
    console.log("refreshed marios-pizza (cafe, espresso, editorial)");
    return;
  }
  const [tenant] = await seedDb
    .insert(tenants)
    .values({ slug: "marios-pizza", theme: "cafe", themeConfig: mariosOptions, published: true })
    .returning({ id: tenants.id });
  await seedDb.insert(restaurantProfiles).values({
    tenantId: tenant.id,
    name: "Marios Pizza",
    description: "Wood-fired pizza on Main Street since 1998.",
    phone: "0123 456 789",
    email: "hello@marios.example.com",
    addressLine1: "1 Main Street",
    city: "Springfield",
    country: "Australia",
  });
  await seedDb.insert(openingHours).values([
    { tenantId: tenant.id, weekday: 0, isClosed: true },
    { tenantId: tenant.id, weekday: 1, openTime: "11:00", closeTime: "21:00" },
    { tenantId: tenant.id, weekday: 2, openTime: "11:00", closeTime: "21:00" },
    { tenantId: tenant.id, weekday: 5, openTime: "11:00", closeTime: "23:00" },
    { tenantId: tenant.id, weekday: 6, openTime: "12:00", closeTime: "23:00" },
  ]);
  const [pizza] = await seedDb
    .insert(menuCategories)
    .values({ tenantId: tenant.id, name: "Pizza", sortOrder: 0 })
    .returning({ id: menuCategories.id });
  const [pasta] = await seedDb
    .insert(menuCategories)
    .values({ tenantId: tenant.id, name: "Pasta", description: "Made fresh daily.", sortOrder: 1 })
    .returning({ id: menuCategories.id });
  await seedDb.insert(menuItems).values([
    {
      tenantId: tenant.id,
      categoryId: pizza.id,
      name: "Margherita",
      priceCents: 1899,
      sortOrder: 0,
    },
    {
      tenantId: tenant.id,
      categoryId: pizza.id,
      name: "Diavola",
      description: "Spicy salami, honey drizzle.",
      priceCents: 2299,
      sortOrder: 1,
    },
    {
      tenantId: tenant.id,
      categoryId: pasta.id,
      name: "Tagliatelle al Ragù",
      priceCents: 2499,
      sortOrder: 0,
    },
    // Never publicly visible: draft and sold-out siblings of real items.
    {
      tenantId: tenant.id,
      categoryId: pizza.id,
      name: "Secret Special",
      priceCents: 999,
      isPublished: false,
    },
    {
      tenantId: tenant.id,
      categoryId: pasta.id,
      name: "Sold-Out Lasagne",
      priceCents: 2199,
      isAvailable: false,
    },
  ]);
  console.log("seeded marios-pizza (cafe, published)");
}

async function seedDragon(): Promise<void> {
  const existing = await tenantId("golden-dragon");
  if (existing) {
    await seedDb
      .update(tenants)
      .set({ theme: "takeaway", themeConfig: dragonOptions })
      .where(eq(tenants.id, existing));
    console.log("refreshed golden-dragon (takeaway, chili, compact)");
    return;
  }
  const [tenant] = await seedDb
    .insert(tenants)
    .values({
      slug: "golden-dragon",
      theme: "takeaway",
      themeConfig: dragonOptions,
      published: true,
    })
    .returning({ id: tenants.id });
  await seedDb.insert(restaurantProfiles).values({
    tenantId: tenant.id,
    name: "Golden Dragon",
    description: "Fast Cantonese takeaway, ready in 15 minutes.",
    phone: "0987 654 321",
    addressLine1: "7 Bridge Road",
    city: "Springfield",
    country: "Australia",
  });
  await seedDb.insert(openingHours).values([
    { tenantId: tenant.id, weekday: 1, isClosed: true },
    { tenantId: tenant.id, weekday: 5, openTime: "17:00", closeTime: "22:00" },
    { tenantId: tenant.id, weekday: 6, openTime: "17:00", closeTime: "22:00" },
  ]);
  const [mains] = await seedDb
    .insert(menuCategories)
    .values({ tenantId: tenant.id, name: "Mains", sortOrder: 0 })
    .returning({ id: menuCategories.id });
  await seedDb.insert(menuItems).values([
    {
      tenantId: tenant.id,
      categoryId: mains.id,
      name: "Sweet & Sour Pork",
      priceCents: 1699,
      sortOrder: 0,
    },
    {
      tenantId: tenant.id,
      categoryId: mains.id,
      name: "Kung Pao Chicken",
      description: "Peanuts, dried chilli, Sichuan pepper.",
      priceCents: 1799,
      sortOrder: 1,
    },
  ]);
  console.log("seeded golden-dragon (takeaway, published)");
}

async function seedDraft(): Promise<void> {
  const existing = await tenantId("draft-diner");
  if (existing) {
    await seedDb
      .update(tenants)
      .set({ theme: "cafe", themeConfig: draftOptions })
      .where(eq(tenants.id, existing));
    console.log("refreshed draft-diner (cafe, terracotta, grid)");
    return;
  }
  const [tenant] = await seedDb
    .insert(tenants)
    .values({ slug: "draft-diner", theme: "cafe", themeConfig: draftOptions, published: false })
    .returning({ id: tenants.id });
  await seedDb.insert(restaurantProfiles).values({
    tenantId: tenant.id,
    name: "Draft Diner",
    description: "Not yet open to the public.",
  });
  console.log("seeded draft-diner (unpublished — must never render)");
}

async function main(): Promise<void> {
  try {
    await seedMarios();
    await seedDragon();
    await seedDraft();
    console.log("Seed complete.");
  } finally {
    await client.end();
  }
}

void main();
