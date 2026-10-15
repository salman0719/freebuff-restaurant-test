/**
 * Readiness predicate tests (Phase 4.3). These rules are shared by the
 * owner's publishing checklist and the operator's onboarding view, so the
 * edge cases are pinned here once: what "named", "entered", and "visible to
 * visitors" each mean.
 */
import { describe, expect, it } from "vitest";
import { hasNamedProfile, hasOpeningHours, hasPublishedMenu } from "./readiness";

describe("hasNamedProfile", () => {
  it("is false without a profile", () => {
    expect(hasNamedProfile(null)).toBe(false);
  });

  it("is false for a blank or whitespace-only name", () => {
    expect(hasNamedProfile({ name: "" })).toBe(false);
    expect(hasNamedProfile({ name: "   " })).toBe(false);
  });

  it("is true for a named profile", () => {
    expect(hasNamedProfile({ name: "Mario's" })).toBe(true);
  });
});

describe("hasPublishedMenu", () => {
  const category = { id: "c1", isPublished: true };
  const item = { categoryId: "c1", isPublished: true, isAvailable: true };

  it("is false with no categories or no items", () => {
    expect(hasPublishedMenu([], [])).toBe(false);
    expect(hasPublishedMenu([category], [])).toBe(false);
  });

  it("is false when the category is a draft", () => {
    expect(hasPublishedMenu([{ id: "c1", isPublished: false }], [item])).toBe(false);
  });

  it("is false when the item is unpublished or unavailable", () => {
    expect(hasPublishedMenu([category], [{ ...item, isPublished: false }])).toBe(false);
    expect(hasPublishedMenu([category], [{ ...item, isAvailable: false }])).toBe(false);
  });

  it("is false when the item lives in another category", () => {
    expect(hasPublishedMenu([category], [{ ...item, categoryId: "c2" }])).toBe(false);
  });

  it("is false for an uncategorised item", () => {
    expect(hasPublishedMenu([category], [{ ...item, categoryId: null }])).toBe(false);
  });

  it("is true for a published category with one visible item", () => {
    expect(hasPublishedMenu([category], [item])).toBe(true);
  });
});

describe("hasOpeningHours", () => {
  it("is false for no rows", () => {
    expect(hasOpeningHours([])).toBe(false);
  });

  it("is false for a day that was never touched", () => {
    expect(hasOpeningHours([{ openTime: null, isClosed: false }])).toBe(false);
  });

  it("is true once any day carries times", () => {
    expect(hasOpeningHours([{ openTime: "09:00", isClosed: false }])).toBe(true);
  });

  it("is true for a deliberately closed day", () => {
    // Marking the week closed is a decision, not an empty week.
    expect(hasOpeningHours([{ openTime: null, isClosed: true }])).toBe(true);
  });
});
