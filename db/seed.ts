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
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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

async function seedMarios(): Promise<void> {
  if (await tenantId("marios-pizza")) {
    console.log("skip marios-pizza (already seeded)");
    return;
  }
  const [tenant] = await seedDb
    .insert(tenants)
    .values({ slug: "marios-pizza", theme: "cafe", published: true })
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
  if (await tenantId("golden-dragon")) {
    console.log("skip golden-dragon (already seeded)");
    return;
  }
  const [tenant] = await seedDb
    .insert(tenants)
    .values({ slug: "golden-dragon", theme: "takeaway", published: true })
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
  if (await tenantId("draft-diner")) {
    console.log("skip draft-diner (already seeded)");
    return;
  }
  const [tenant] = await seedDb
    .insert(tenants)
    .values({ slug: "draft-diner", theme: "cafe", published: false })
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
