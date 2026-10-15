/**
 * Onboarding checklist tests (Phase 4.3). Pure: no database, no I/O.
 *
 * The most useful cases are the first two — the state a just-provisioned
 * tenant is actually in after 4.2 runs, and the difference between a gap that
 * blocks a usable site and one that is merely unset. Both document what an
 * operator sees, and both are what would drift first if the provisioning
 * defaults or these rules moved apart.
 */
import { describe, expect, it } from "vitest";
import {
  getOnboardingSteps,
  hasOutstandingSetup,
  outstandingOnboardingSteps,
  summariseOnboarding,
  unmetOnboardingSteps,
  type OnboardingStep,
  type OnboardingStepKey,
  type TenantSetupState,
} from "./onboarding";

function state(overrides: Partial<TenantSetupState> = {}): TenantSetupState {
  return {
    theme: "cafe",
    themeLabel: "Café",
    published: false,
    customDomain: null,
    profile: { name: "Mario's Pizza" },
    menu: {
      categories: [{ id: "c1", isPublished: true }],
      items: [{ categoryId: "c1", isPublished: true, isAvailable: true }],
    },
    hours: [{ openTime: "09:00", isClosed: false }],
    ownerCount: 1,
    ...overrides,
  };
}

function step(current: TenantSetupState, key: OnboardingStepKey): OnboardingStep | undefined {
  return getOnboardingSteps(current).find((item) => item.key === key);
}

describe("a freshly provisioned restaurant", () => {
  // Exactly what `provisionTenant` leaves behind: a named profile, an explicit
  // theme, nothing else, and no owner until one is invited.
  const provisioned = state({
    menu: { categories: [], items: [] },
    hours: [],
    ownerCount: 0,
  });

  it("misses the menu, hours, owner, domain, and publishing", () => {
    expect(unmetOnboardingSteps(getOnboardingSteps(provisioned)).map((item) => item.key)).toEqual([
      "menu",
      "hours",
      "owner",
      "domain",
      "published",
    ]);
  });

  it("is held back by four of those, not by the domain", () => {
    // A missing custom domain is not a blocker: the platform address works,
    // and custom domains are Phase 5.
    expect(
      outstandingOnboardingSteps(getOnboardingSteps(provisioned)).map((item) => item.key)
    ).toEqual(["menu", "hours", "owner", "published"]);
  });

  it("reports 2 of 7 set", () => {
    expect(summariseOnboarding(getOnboardingSteps(provisioned))).toEqual({
      met: 2,
      total: 7,
      complete: false,
    });
  });
});

describe("required versus optional", () => {
  it("does not block on a custom domain alone", () => {
    // Published and otherwise complete: the only unset step is the optional one.
    const ready = state({ published: true });
    expect(unmetOnboardingSteps(getOnboardingSteps(ready)).map((item) => item.key)).toEqual([
      "domain",
    ]);
    expect(hasOutstandingSetup(getOnboardingSteps(ready))).toBe(false);
    expect(summariseOnboarding(getOnboardingSteps(ready)).complete).toBe(false);
  });

  it("treats a missing profile, menu, hours, owner, or publishing as blocking", () => {
    const blockers: Partial<TenantSetupState>[] = [
      { profile: null },
      { menu: { categories: [], items: [] } },
      { hours: [] },
      { ownerCount: 0 },
      { published: false },
    ];
    for (const override of blockers) {
      expect(hasOutstandingSetup(getOnboardingSteps(state(override)))).toBe(true);
    }
  });

  it("marks exactly the five steps a visitor would notice as required", () => {
    const required = getOnboardingSteps(state())
      .filter((item) => item.required)
      .map((item) => item.key);
    expect(required).toEqual(["profile", "menu", "hours", "owner", "published"]);
  });
});

describe("getOnboardingSteps", () => {
  it("reports a fully set-up restaurant as complete", () => {
    const done = state({ published: true, customDomain: "marios.example.com" });
    const steps = getOnboardingSteps(done);
    expect(unmetOnboardingSteps(steps)).toEqual([]);
    expect(summariseOnboarding(steps)).toEqual({ met: 7, total: 7, complete: true });
  });

  it("always includes every step, in a stable order", () => {
    expect(getOnboardingSteps(state()).map((item) => item.key)).toEqual([
      "profile",
      "menu",
      "hours",
      "theme",
      "owner",
      "domain",
      "published",
    ]);
  });

  it("reports the theme rather than gating on it", () => {
    // `tenants.theme` is NOT NULL with a platform default and 4.2 writes an
    // explicit value, so nothing records whether a decision was made. The step
    // is a report; pretending otherwise would invent state we do not store.
    expect(step(state({ themeLabel: "Diner" }), "theme")).toEqual({
      key: "theme",
      label: "Theme selected",
      met: true,
      detail: "Diner",
      required: false,
    });
  });

  it("asks for the profile by name, matching the owner's own checklist", () => {
    expect(step(state({ profile: null }), "profile")?.met).toBe(false);
    expect(step(state({ profile: { name: "  " } }), "profile")?.met).toBe(false);
  });

  it("counts the menu the way a visitor sees it", () => {
    const draft = state({
      menu: {
        categories: [{ id: "c1", isPublished: false }],
        items: [{ categoryId: "c1", isPublished: true, isAvailable: true }],
      },
    });
    expect(step(draft, "menu")?.met).toBe(false);
    // A draft category is not a menu, but the items are still real.
    expect(step(draft, "menu")?.detail).toBe("1 item visible");
  });

  it("pluralises the menu readout", () => {
    const many = state({
      menu: {
        categories: [{ id: "c1", isPublished: true }],
        items: [
          { categoryId: "c1", isPublished: true, isAvailable: true },
          { categoryId: "c1", isPublished: true, isAvailable: true },
        ],
      },
    });
    expect(step(many, "menu")?.detail).toBe("2 items visible");
  });

  it("says nothing is visible rather than '0 items visible'", () => {
    expect(step(state({ menu: { categories: [], items: [] } }), "menu")?.detail).toBe(
      "Nothing visible to visitors yet"
    );
  });

  it("treats a deliberately closed week as entered hours", () => {
    expect(step(state({ hours: [{ openTime: null, isClosed: true }] }), "hours")?.met).toBe(true);
  });

  it("distinguishes one owner from several", () => {
    expect(step(state({ ownerCount: 0 }), "owner")).toEqual({
      key: "owner",
      label: "Owner access",
      met: false,
      detail: "No owner assigned",
      required: true,
    });
    expect(step(state({ ownerCount: 1 }), "owner")?.detail).toBe("1 person");
    expect(step(state({ ownerCount: 3 }), "owner")?.detail).toBe("3 people");
  });

  it("reports a domain as recorded, never as live", () => {
    // Verification and HTTPS are Phase 5; 5.3 is explicit that a domain must
    // not be called live until routing and TLS do. A green tick here means
    // "not still to be entered".
    const domain = step(state({ customDomain: "marios.example.com" }), "domain");
    expect(domain?.met).toBe(true);
    expect(domain?.detail).toBe("marios.example.com");
    expect(domain?.detail).not.toMatch(/live|verified|active|working/i);
    expect(domain?.label).toBe("Custom domain");
  });

  it("reads an unset domain as the platform address, not as an error", () => {
    expect(step(state(), "domain")).toEqual({
      key: "domain",
      label: "Custom domain",
      met: false,
      detail: "Platform address only",
      required: false,
    });
  });

  it("reports publishing plainly", () => {
    expect(step(state({ published: true }), "published")).toEqual({
      key: "published",
      label: "Website published",
      met: true,
      detail: "Live",
      required: true,
    });
    expect(step(state(), "published")?.detail).toBe("Draft");
  });
});

describe("summariseOnboarding", () => {
  it("counts an empty checklist as complete", () => {
    // Degenerate but true: nothing outstanding is nothing outstanding.
    expect(summariseOnboarding([])).toEqual({ met: 0, total: 0, complete: true });
  });

  it("counts every step, required or not", () => {
    const steps = getOnboardingSteps(state({ published: true, customDomain: "x.example.com" }));
    expect(summariseOnboarding(steps).met).toBe(7);
  });
});
