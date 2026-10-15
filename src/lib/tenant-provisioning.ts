/**
 * Operator tenant provisioning (Phase 4.2). Server-only: imports the
 * database. Do NOT mark this file `"use server"` — every export would become
 * a callable action; the operator's actions live in
 * `app/operator/actions.ts` and call in here.
 *
 * This is the ONE module allowed to create tenants and grant tenant
 * membership. Its isolation works differently from `tenant-data.ts`, and the
 * difference is the whole point:
 *
 * - `tenant-data.ts` is structurally safe because every function takes an
 *   authorised `TenantContext` and there is no parameter through which a
 *   caller could smuggle another tenant's id.
 * - Provisioning operates ACROSS tenants by design — an operator sets up
 *   restaurants they are not a member of, which is the entire feature. So
 *   the guarantee has to come from somewhere else, and it is enforced here:
 *
 *   1. Every entry point takes an `AuthenticatedUser` produced by
 *      `requireOperator`, and re-checks `role === "operator"` itself. A
 *      forged, stale, or hand-built identity is refused even if a caller
 *      reached this module without going through the gate — the check does
 *      not depend on the caller having done the right thing.
 *   2. A tenant is addressed by its slug and resolved before any write, so
 *      a write never targets an id invented by a caller. There is no
 *      tenant-id parameter anywhere below.
 *
 * Two decisions worth stating plainly:
 *
 * - **Creating a tenant does not make the operator a member of it.**
 *   Membership is how a restaurant's own people get access; an operator's
 *   authority is the global role. Auto-adding the operator would also make
 *   the onboarding check "owner access configured" true the moment a tenant
 *   exists — the exact thing an operator needs that check to tell them.
 * - **An invited owner's account is created with the platform DEFAULT role**
 *   (`users.role` defaults to `owner`), the same act Auth.js's adapter
 *   performs on a first magic-link sign-in. The owner-invite path cannot
 *   promote anyone to platform staff; the staff grant (`grantStaffAccess`)
 *   is the separate act that does, and it updates an existing account
 *   rather than creating one. Both live here, inside this module's
 *   allowlist in `operator-access.test.ts` (the tripwire that fails if any
 *   other module under `src/` writes `users.role`).
 *
 * - **Every act leaves a trail (Phase 4.4).** Each successful write records
 *   WHO did it and what changed, in the same transaction as the change, so a
 *   restaurant cannot exist without the record of its creation. Refusals
 *   record nothing: nothing changed. The rules decide when an act is
 *   recorded and what the record says (`./audit.ts`); the store is what
 *   actually writes it, and it is handed the event so the decision stays
 *   testable without a database.
 *
 * The store is injected so the rules — who may provision, what is valid, how
 * duplicates resolve — are unit-tested without a database, exactly as
 * `tenant-context.ts` injects its finder.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db";
import type { MembershipRole, ThemeId } from "../../db/constants";
import { memberships, restaurantProfiles, tenants, users } from "../../db/schema";
import {
  ownerGrantedEvent,
  staffGrantedEvent,
  tenantCreatedEvent,
  writeAuditEvent,
  type AuditEvent,
} from "./audit";
import { isUniqueViolation } from "./db-errors";
import type { AuthenticatedUser } from "./permissions";
import { err, ok, type ServiceResult } from "./result";
import {
  assignOwnerSchema,
  createTenantSchema,
  grantStaffSchema,
  validationFields,
} from "./validation";

/** A tenant as provisioning reports it back to the console. */
export interface ProvisionedTenant {
  id: string;
  slug: string;
  theme: ThemeId;
  published: boolean;
}

/** The account granted the platform staff role. */
export interface GrantedStaff {
  userId: string;
  email: string;
}

/** The person granted owner access, and whether this call created them. */
export interface ProvisionedOwner {
  userId: string;
  email: string;
  tenantId: string;
  role: MembershipRole;
  /** True when the account did not exist and was created as an invite. */
  created: boolean;
}

/**
 * The write surface provisioning needs. Injected so the decision rules can
 * be tested without a database; the default implementation below is the only
 * place that talks to Drizzle.
 */
export interface ProvisioningStore {
  findTenantBySlug(slug: string): Promise<{ id: string } | null>;
  /**
   * The tenant, its profile, and the record of the act in ONE transaction.
   * `null` means the slug was taken (checked, or lost to a race) — and a lost
   * race writes no audit row, because the insert rolled back.
   */
  createTenantWithProfile(
    input: {
      slug: string;
      theme: ThemeId;
      published: boolean;
      name: string;
    },
    event: AuditEvent
  ): Promise<ProvisionedTenant | null>;
  /** Finds the account for `email`, creating one (default role) if absent. */
  findOrCreateUser(email: string): Promise<{ id: string; created: boolean }>;
  /** Finds the account for `email`, creating nothing. */
  findUserByEmail(email: string): Promise<{ id: string; role: string } | null>;
  /**
   * The role update and the record of granting it, in one transaction. A
   * no-op (already staff) writes neither — the trail describes changes, and
   * there was none.
   */
  promoteToStaff(input: { userId: string }, event: AuditEvent): Promise<"promoted" | "duplicate">;
  /**
   * The membership and the record of granting it, in one transaction. A
   * duplicate writes neither — the trail describes changes, and there was
   * none.
   */
  addMembership(
    input: {
      userId: string;
      tenantId: string;
      role: MembershipRole;
    },
    event: AuditEvent
  ): Promise<"created" | "duplicate">;
}

function operatorOnly<T>(): ServiceResult<T> {
  return err("FORBIDDEN", "Operator access required.");
}

/**
 * The authorisation check, local to this module on purpose: it must hold
 * even for a caller that never went through `requireOperator`.
 *
 * A type predicate rather than a plain boolean, so the narrowed identity is
 * the SAME one the audit row is attributed to: `act` cannot reach
 * `tenantCreatedEvent` without having passed this check.
 */
function isOperator(act: AuthenticatedUser | null | undefined): act is AuthenticatedUser {
  return act?.role === "operator";
}

function slugTaken<T>(): ServiceResult<T> {
  return err("CONFLICT", "A restaurant with that address already exists.", {
    slug: ["A restaurant with that address already exists."],
  });
}

/**
 * Create a restaurant: a tenant row plus the profile that carries its name,
 * on the tenant's own defaults (unpublished unless asked otherwise, the
 * chosen theme, no content). Safe by construction — a new tenant has no
 * menu, no hours, and no owner, which is exactly what 4.3 reports.
 *
 * The tenant and its profile are written in ONE transaction. Two sequential
 * inserts would leave a nameless tenant behind if the second failed, and
 * that half-created row is invisible in the console — it reports as "profile
 * not started" rather than as the failure it is.
 */
export async function provisionTenant(
  act: AuthenticatedUser | null | undefined,
  input: unknown,
  store: ProvisioningStore = defaultStore
): Promise<ServiceResult<ProvisionedTenant>> {
  if (!isOperator(act)) {
    return operatorOnly();
  }
  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid restaurant.", validationFields(parsed.error));
  }
  const existing = await store.findTenantBySlug(parsed.data.slug);
  if (existing) {
    return slugTaken();
  }
  const created = await store.createTenantWithProfile(
    {
      slug: parsed.data.slug,
      theme: parsed.data.theme,
      published: parsed.data.published,
      name: parsed.data.name,
    },
    tenantCreatedEvent(act, {
      slug: parsed.data.slug,
      theme: parsed.data.theme,
      published: parsed.data.published,
    })
  );
  if (!created) {
    return slugTaken();
  }
  return ok(created);
}

/**
 * Grant someone owner access to a restaurant, inviting them if they have no
 * account yet.
 *
 * An invite creates the account with the platform default role and no
 * membership anywhere else, which is what makes the magic-link sign-in
 * attach to it: the adapter looks the email up and finds this row. Nothing
 * is emailed from here — the owner signs in the same way every other owner
 * does.
 *
 * A membership is unique per `(userId, tenantId)`, so re-granting is a
 * conflict rather than a silent second row.
 */
export async function inviteTenantOwner(
  act: AuthenticatedUser | null | undefined,
  input: unknown,
  store: ProvisioningStore = defaultStore
): Promise<ServiceResult<ProvisionedOwner>> {
  if (!isOperator(act)) {
    return operatorOnly();
  }
  const parsed = assignOwnerSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid owner details.", validationFields(parsed.error));
  }
  const tenant = await store.findTenantBySlug(parsed.data.slug);
  if (!tenant) {
    return err("NOT_FOUND", "No restaurant with that address.", {
      slug: ["No restaurant with that address."],
    });
  }
  const user = await store.findOrCreateUser(parsed.data.email);
  const membership = await store.addMembership(
    {
      userId: user.id,
      tenantId: tenant.id,
      role: parsed.data.role,
    },
    ownerGrantedEvent(
      act,
      { slug: parsed.data.slug },
      { email: parsed.data.email, role: parsed.data.role, created: user.created }
    )
  );
  if (membership === "duplicate") {
    return err("CONFLICT", "That person already has access to this restaurant.", {
      email: ["Already has access to this restaurant."],
    });
  }
  return ok({
    userId: user.id,
    email: parsed.data.email,
    tenantId: tenant.id,
    role: parsed.data.role,
    created: user.created,
  });
}

/**
 * Grant someone the platform staff role, recorded as a platform-scoped
 * audit event (no tenant is the subject, so the row carries a null
 * `tenantId` — the shape the trail was left nullable for).
 *
 * Unlike an owner grant this never creates the account: a typo in an owner
 * invite invents an unprivileged row, while a typo here would invent a
 * privileged one. The person signs in once (or is invited as an owner
 * first); the operator promotes the account that already exists. Someone
 * who is already staff is a conflict rather than a second row.
 */
export async function grantStaffAccess(
  act: AuthenticatedUser | null | undefined,
  input: unknown,
  store: ProvisioningStore = defaultStore
): Promise<ServiceResult<GrantedStaff>> {
  if (!isOperator(act)) {
    return operatorOnly();
  }
  const parsed = grantStaffSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "Invalid staff details.", validationFields(parsed.error));
  }
  const user = await store.findUserByEmail(parsed.data.email);
  if (!user) {
    return err("NOT_FOUND", "No account with that address.", {
      email: ["No account with that address."],
    });
  }
  if (user.role === "operator") {
    return err("CONFLICT", "That person is already platform staff.", {
      email: ["Already platform staff."],
    });
  }
  const promoted = await store.promoteToStaff(
    { userId: user.id },
    staffGrantedEvent(act, { email: parsed.data.email })
  );
  if (promoted === "duplicate") {
    return err("CONFLICT", "That person is already platform staff.", {
      email: ["Already platform staff."],
    });
  }
  return ok({ userId: user.id, email: parsed.data.email });
}

/** The one place provisioning touches the database. */
const defaultStore: ProvisioningStore = {
  async findTenantBySlug(slug) {
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  },

  async createTenantWithProfile({ slug, theme, published, name }, event) {
    try {
      return await db.transaction(async (tx) => {
        const inserted = await tx.insert(tenants).values({ slug, theme, published }).returning({
          id: tenants.id,
          slug: tenants.slug,
          theme: tenants.theme,
          published: tenants.published,
        });
        const tenant = inserted[0];
        if (!tenant) {
          throw new Error("Tenant insert returned no row.");
        }
        await tx.insert(restaurantProfiles).values({ tenantId: tenant.id, name });
        await writeAuditEvent(tx, event, tenant.id);
        return { ...tenant, theme: tenant.theme as ThemeId };
      });
    } catch (error) {
      // The slug pre-check above is a courtesy, not the guard: the unique
      // index is. A race that slips past the check lands here and resolves
      // to the same friendly conflict.
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  },

  async findOrCreateUser(email) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const found = existing[0];
    if (found) {
      return { id: found.id, created: false };
    }
    try {
      // No `role` on purpose: the column default is the platform default,
      // so provisioning grants nothing beyond what a first sign-in would.
      const inserted = await db.insert(users).values({ email }).returning({ id: users.id });
      const created = inserted[0];
      if (!created) {
        throw new Error("User insert returned no row.");
      }
      return { id: created.id, created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        const winner = raced[0];
        if (winner) {
          return { id: winner.id, created: false };
        }
      }
      throw error;
    }
  },

  async findUserByEmail(email) {
    const rows = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows[0] ?? null;
  },

  async promoteToStaff({ userId }, event) {
    return db.transaction(async (tx) => {
      const rows = await tx
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      // Lost to a race (deleted between the check and the write) or already
      // staff: either way nothing changed, so nothing is recorded.
      if (!rows[0] || rows[0].role === "operator") {
        return "duplicate";
      }
      await tx.update(users).set({ role: "operator" }).where(eq(users.id, userId));
      await writeAuditEvent(tx, event, null);
      return "promoted";
    });
  },

  async addMembership({ userId, tenantId, role }, event) {
    try {
      await db.transaction(async (tx) => {
        await tx.insert(memberships).values({ userId, tenantId, role });
        await writeAuditEvent(tx, event, tenantId);
      });
      return "created";
    } catch (error) {
      if (isUniqueViolation(error)) {
        return "duplicate";
      }
      throw error;
    }
  },
};
