/**
 * Provisioning tests (Phase 4.2). No database: the store is injected, so
 * every rule here — who may provision, what is valid, which duplicate wins,
 * what an invite does to an account — runs as a plain unit test.
 *
 * The authorisation cases matter most. Provisioning writes ACROSS tenants,
 * so unlike `tenant-data.ts` it cannot rely on a tenant-scoped context to
 * keep it honest; it re-checks the operator role itself. These tests forge
 * the identity a caller would have to fake to get past it.
 */
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "./permissions";
import { inviteTenantOwner, provisionTenant, type ProvisioningStore } from "./tenant-provisioning";

const staff: AuthenticatedUser = { userId: "user_staff", role: "operator" };
const tenantOwner: AuthenticatedUser = { userId: "user_owner", role: "owner" };

function fakeStore(overrides: Partial<ProvisioningStore> = {}): ProvisioningStore {
  return {
    findTenantBySlug: async () => null,
    createTenantWithProfile: async (input) => ({
      id: "tenant_new",
      slug: input.slug,
      theme: input.theme,
      published: input.published,
    }),
    findOrCreateUser: async () => ({ id: "user_invited", created: true }),
    addMembership: async () => "created",
    ...overrides,
  };
}

describe("provisionTenant authorisation", () => {
  it.each([
    ["a restaurant owner", tenantOwner],
    ["a user with no role", { userId: "user_x" } as AuthenticatedUser],
    ["a near-miss role", { userId: "user_x", role: "Operator" } as AuthenticatedUser],
    ["no identity at all", null],
    ["undefined", undefined],
  ])("refuses %s without touching the store", async (_label, act) => {
    const store = fakeStore();
    const spy = vi.spyOn(store, "createTenantWithProfile");
    const result = await provisionTenant(act, { slug: "new-place", name: "New Place" }, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("provisionTenant", () => {
  it("creates the tenant with its profile and returns it", async () => {
    const created: Parameters<ProvisioningStore["createTenantWithProfile"]>[0][] = [];
    const store = fakeStore({
      createTenantWithProfile: async (input) => {
        created.push(input);
        return {
          id: "tenant_new",
          slug: input.slug,
          theme: input.theme,
          published: input.published,
        };
      },
    });
    const result = await provisionTenant(staff, { slug: "the-diner", name: "The Diner" }, store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        id: "tenant_new",
        slug: "the-diner",
        theme: "cafe",
        published: false,
      });
    }
    // The profile name is created alongside, in the same call.
    expect(created).toEqual([
      { slug: "the-diner", theme: "cafe", published: false, name: "The Diner" },
    ]);
  });

  it("applies safe defaults: café theme and unpublished", async () => {
    const store = fakeStore();
    const result = await provisionTenant(staff, { slug: "safe-default", name: "Safe" }, store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // A brand-new site is a draft until the operator says otherwise.
      expect(result.data.published).toBe(false);
      expect(result.data.theme).toBe("cafe");
    }
  });

  it("takes the chosen theme and publishing state when given", async () => {
    const store = fakeStore();
    const result = await provisionTenant(
      staff,
      { slug: "night-market", name: "Night Market", theme: "takeaway", published: true },
      store
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.theme).toBe("takeaway");
      expect(result.data.published).toBe(true);
    }
  });

  it.each([
    ["an unknown theme", { slug: "ok-slug", name: "Name", theme: "neon" }],
    ["an empty name", { slug: "ok-slug", name: "   " }],
    ["a missing name", { slug: "ok-slug" }],
    ["an uppercase slug", { slug: "Not-Safe", name: "Name" }],
    ["a reserved slug", { slug: "admin", name: "Name" }],
    ["a slug with a trailing hyphen", { slug: "safe-", name: "Name" }],
    ["no slug", { name: "Name" }],
  ])("rejects %s with field errors", async (_label, input) => {
    const store = fakeStore();
    const spy = vi.spyOn(store, "createTenantWithProfile");
    const result = await provisionTenant(staff, input, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.fields).toBeDefined();
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses a slug that already exists", async () => {
    const store = fakeStore({ findTenantBySlug: async () => ({ id: "tenant_existing" }) });
    const spy = vi.spyOn(store, "createTenantWithProfile");
    const result = await provisionTenant(staff, { slug: "taken", name: "Taken" }, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.fields?.slug).toHaveLength(1);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("resolves a slug lost to a race as the same conflict", async () => {
    // The pre-check passed; the unique index refused it. One message either way.
    const store = fakeStore({ createTenantWithProfile: async () => null });
    const result = await provisionTenant(staff, { slug: "raced", name: "Raced" }, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
    }
  });
});

describe("inviteTenantOwner authorisation", () => {
  it.each([
    ["a restaurant owner", tenantOwner],
    ["no identity at all", null],
  ])("refuses %s without touching the store", async (_label, act) => {
    const store = fakeStore();
    const spy = vi.spyOn(store, "findOrCreateUser");
    const result = await inviteTenantOwner(act, { slug: "any", email: "a@example.com" }, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("inviteTenantOwner", () => {
  it("creates the account for a person who has never signed in, then grants access", async () => {
    const store = fakeStore({
      findTenantBySlug: async () => ({ id: "tenant_a" }),
      findOrCreateUser: async () => ({ id: "user_invited", created: true }),
    });
    const result = await inviteTenantOwner(
      staff,
      { slug: "the-diner", email: "owner@example.com" },
      store
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        userId: "user_invited",
        email: "owner@example.com",
        tenantId: "tenant_a",
        role: "owner",
        created: true,
      });
    }
  });

  it("reuses an existing account instead of creating a second one", async () => {
    const create = vi.fn(async () => ({ id: "user_existing", created: false }));
    const store = fakeStore({
      findTenantBySlug: async () => ({ id: "tenant_a" }),
      findOrCreateUser: create,
    });
    const result = await inviteTenantOwner(
      staff,
      { slug: "the-diner", email: "known@example.com" },
      store
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.created).toBe(false);
      expect(result.data.userId).toBe("user_existing");
    }
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never makes the operator a member of the restaurant", async () => {
    // The whole reason creating a tenant does not auto-add the operator: if it
    // did, "owner access configured" would be true for every tenant and the
    // onboarding check would say nothing.
    const granted: Parameters<ProvisioningStore["addMembership"]>[0][] = [];
    const store = fakeStore({
      findTenantBySlug: async () => ({ id: "tenant_a" }),
      findOrCreateUser: async () => ({ id: "user_invited", created: true }),
      addMembership: async (input) => {
        granted.push(input);
        return "created";
      },
    });
    await inviteTenantOwner(staff, { slug: "the-diner", email: "owner@example.com" }, store);
    expect(granted).toHaveLength(1);
    expect(granted[0].userId).toBe("user_invited");
    expect(granted[0].userId).not.toBe(staff.userId);
    expect(granted[0].role).toBe("owner");
  });

  it("honours an explicitly requested membership role", async () => {
    const store = fakeStore({ findTenantBySlug: async () => ({ id: "tenant_a" }) });
    const result = await inviteTenantOwner(
      staff,
      { slug: "the-diner", email: "support@example.com", role: "operator" },
      store
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.role).toBe("operator");
    }
  });

  it("refuses a restaurant that does not exist", async () => {
    const store = fakeStore();
    const spy = vi.spyOn(store, "findOrCreateUser");
    const result = await inviteTenantOwner(
      staff,
      { slug: "no-such-place", email: "owner@example.com" },
      store
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    // No account is created for a tenant that is not there.
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a malformed email before resolving anything", async () => {
    const store = fakeStore();
    const find = vi.spyOn(store, "findTenantBySlug");
    const result = await inviteTenantOwner(
      staff,
      { slug: "the-diner", email: "not-an-email" },
      store
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.fields?.email).toBeDefined();
    }
    expect(find).not.toHaveBeenCalled();
  });

  it("reports a second grant as a conflict, not a silent duplicate", async () => {
    const store = fakeStore({
      findTenantBySlug: async () => ({ id: "tenant_a" }),
      addMembership: async () => "duplicate",
    });
    const result = await inviteTenantOwner(
      staff,
      { slug: "the-diner", email: "owner@example.com" },
      store
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.fields?.email).toHaveLength(1);
    }
  });
});
