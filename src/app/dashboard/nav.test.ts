import { describe, expect, it } from "vitest";
import { getDashboardNav } from "./nav";

describe("getDashboardNav", () => {
  it("gives every member the five content sections", () => {
    const items = getDashboardNav({
      slug: "marios",
      membershipRole: "owner",
      globalRole: "owner",
    });
    expect(items.map((item) => item.label)).toEqual([
      "Overview",
      "Profile",
      "Hours",
      "Menu",
      "Theme",
    ]);
    expect(items[0]?.href).toBe("/dashboard/marios");
    expect(items[1]?.href).toBe("/dashboard/marios/profile");
  });

  it("does not vary by tenant membership role", () => {
    const owner = getDashboardNav({ slug: "s", membershipRole: "owner", globalRole: "owner" });
    const operator = getDashboardNav({
      slug: "s",
      membershipRole: "operator",
      globalRole: "owner",
    });
    expect(operator).toEqual(owner);
  });

  it("adds the operator console only for global operator staff", () => {
    const staff = getDashboardNav({ slug: "s", membershipRole: "owner", globalRole: "operator" });
    expect(staff.at(-1)).toEqual({ href: "/operator", label: "Operator console" });
    const plain = getDashboardNav({ slug: "s", membershipRole: "owner", globalRole: "owner" });
    expect(plain.some((item) => item.href === "/operator")).toBe(false);
  });
});
