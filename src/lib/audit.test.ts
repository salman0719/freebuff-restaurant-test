/**
 * Audit trail tests (Phase 4.4). Pure: the display mapping, the time format,
 * and the read gate all run without a database, because the reader is
 * injected. The live half — a real write, a real read, and what survives a
 * deletion — lives in `audit-live.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_LIMIT,
  describeAuditEvent,
  formatAuditTime,
  listTenantActivity,
  type AuditReader,
  type AuditRecord,
} from "./audit";
import type { AuthenticatedUser } from "./permissions";

const staff: AuthenticatedUser = { userId: "user_staff", role: "operator" };

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: "audit_1",
    action: "tenant.created",
    actorUserId: "user_staff",
    actorEmail: "staff@example.com",
    tenantId: "tenant_a",
    tenantSlug: "marios-pizza",
    detail: { theme: "takeaway", published: false },
    createdAt: new Date("2026-10-14T13:05:00Z"),
    ...overrides,
  };
}

function fakeReader(events: AuditRecord[] = []): AuditReader {
  return { listForTenant: vi.fn(async () => events) };
}

describe("describeAuditEvent", () => {
  it("says what a creation actually produced, theme and publishing state", () => {
    expect(describeAuditEvent(record())).toEqual({
      label: "Created the restaurant",
      detail: "Started as a draft with the Takeaway theme",
    });
  });

  it("reads a published creation as published, not as a draft", () => {
    const described = describeAuditEvent(record({ detail: { theme: "bistro", published: true } }));
    expect(described.detail).toBe("Started as published with the Bistro theme");
  });

  it("distinguishes an invitation from a grant to an existing account", () => {
    const invited = describeAuditEvent(
      record({
        action: "tenant.owner_granted",
        detail: { email: "owner@example.com", role: "owner", invited: true },
      })
    );
    const existing = describeAuditEvent(
      record({
        action: "tenant.owner_granted",
        detail: { email: "owner@example.com", role: "owner", invited: false },
      })
    );
    expect(invited.detail).toBe("Invited owner@example.com as owner");
    expect(existing.detail).toBe("Gave owner@example.com owner access");
    expect(invited.label).toBe("Granted access");
  });

  it("names platform staff as staff, not as an owner", () => {
    const described = describeAuditEvent(
      record({
        action: "tenant.owner_granted",
        detail: { email: "support@example.com", role: "operator", invited: true },
      })
    );
    expect(described.detail).toBe("Invited support@example.com as platform staff");
  });

  it("reports an action it does not know by its key instead of dropping it", () => {
    // A row written by a newer deploy is still evidence.
    expect(describeAuditEvent({ action: "tenant.archived", detail: {} })).toEqual({
      label: "tenant.archived",
      detail: "",
    });
  });

  it("survives a detail payload that is missing the fields it wants", () => {
    const described = describeAuditEvent({ action: "tenant.owner_granted", detail: {} });
    expect(described.detail).toBe("Gave an account owner access");
  });

  it("falls back to the default theme label rather than throwing on a retired id", () => {
    const described = describeAuditEvent(
      record({ detail: { theme: "retired", published: false } })
    );
    expect(described.detail).toContain("Café");
  });
});

describe("formatAuditTime", () => {
  it("renders one stated timezone, so a UTC clock is never read as a local one", () => {
    expect(formatAuditTime(new Date("2026-10-14T13:05:00Z"))).toBe("14 Oct 2026, 13:05 UTC");
    expect(formatAuditTime(new Date("2026-01-02T00:30:00Z"))).toBe("2 Jan 2026, 00:30 UTC");
  });
});

describe("listTenantActivity authorisation", () => {
  const refused: [string, AuthenticatedUser | null | undefined][] = [
    ["a restaurant owner", { userId: "user_owner", role: "owner" }],
    ["a user with no role", { userId: "user_x" } as AuthenticatedUser],
    ["a near-miss role", { userId: "user_x", role: "Operator" }],
    ["no identity at all", null],
    ["undefined", undefined],
  ];

  it.each(refused)("refuses %s without reading anything", async (_label, act) => {
    const reader = fakeReader([record()]);
    const result = await listTenantActivity(act, "tenant_a", ACTIVITY_LIMIT, reader);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(reader.listForTenant).not.toHaveBeenCalled();
  });

  it("refuses an empty subject rather than reporting no history for it", async () => {
    const reader = fakeReader([record()]);
    const result = await listTenantActivity(staff, "", ACTIVITY_LIMIT, reader);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(reader.listForTenant).not.toHaveBeenCalled();
  });
});

describe("listTenantActivity", () => {
  it("reads one restaurant's history for platform staff", async () => {
    const reader = fakeReader([record()]);
    const result = await listTenantActivity(staff, "tenant_a", 5, reader);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((event) => event.action)).toEqual(["tenant.created"]);
    }
    expect(reader.listForTenant).toHaveBeenCalledWith("tenant_a", 5);
  });

  it("asks for its own default limit when the caller does not pick one", async () => {
    const reader = fakeReader();
    await listTenantActivity(staff, "tenant_a", undefined, reader);
    expect(reader.listForTenant).toHaveBeenCalledWith("tenant_a", ACTIVITY_LIMIT);
  });

  it("reports a restaurant with no recorded acts as empty, not as an error", async () => {
    const result = await listTenantActivity(staff, "tenant_a", ACTIVITY_LIMIT, fakeReader([]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
  });
});
