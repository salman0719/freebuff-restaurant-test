/**
 * Dashboard navigation model (Phase 3.1). Pure — unit-tested, no I/O.
 *
 * Every tenant member (owner or operator role) sees the same five
 * content sections: per-action checks land with the 3.2–3.5 editors,
 * not in the nav. Global `operator` staff additionally see the
 * Operator console link (built in Phase 4).
 *
 * Scaffolding note: the profile/hours/menu/theme routes arrive with
 * their editors (3.2–3.5); until then those links render the root
 * not-found page — safe, never another tenant's content.
 */
import type { MembershipRole } from "@/lib/restaurant";

export interface DashboardNavItem {
  href: string;
  label: string;
}

export interface DashboardNavOptions {
  slug: string;
  membershipRole: MembershipRole;
  /** Global platform role from the session (`owner` by default). */
  globalRole: string;
}

const memberSections = ["profile", "hours", "menu", "theme"] as const;

const sectionLabels: Record<(typeof memberSections)[number], string> = {
  profile: "Profile",
  hours: "Hours",
  menu: "Menu",
  theme: "Theme",
};

export function getDashboardNav({ slug, globalRole }: DashboardNavOptions): DashboardNavItem[] {
  const base = `/dashboard/${slug}`;
  const items: DashboardNavItem[] = [
    { href: base, label: "Overview" },
    ...memberSections.map((section) => ({
      href: `${base}/${section}`,
      label: sectionLabels[section],
    })),
  ];
  if (globalRole === "operator") {
    items.push({ href: "/operator", label: "Operator console" });
  }
  return items;
}

/**
 * Which nav href owns the current path, so the shell can highlight it.
 * Longest match wins: `/dashboard/x/profile` matches both the profile
 * section and the overview (`/dashboard/x`), and the deeper link is the
 * one the visitor is actually on. Pure so the rule stays unit-tested.
 */
export function activeNavHref(pathname: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}
