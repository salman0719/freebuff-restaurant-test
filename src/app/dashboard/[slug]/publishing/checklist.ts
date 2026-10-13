/**
 * Publishing readiness checklist (Phase 3.8). Pure — unit-tested, no I/O.
 *
 * Advisory only, never blocking: publishing stays one click because the
 * MVP has no content requirements for going live (an owner may publish a
 * landing page before the menu exists). Unmet items link to the editor
 * that fixes them. "Set" mirrors the overview card exactly (a day counts
 * once it carries times or is marked closed), so the two never disagree.
 */
import type { OwnerRestaurant } from "@/lib/restaurant";

export interface ChecklistItem {
  key: "profile" | "menu" | "hours";
  label: string;
  met: boolean;
  href: string;
}

export function getPublishingChecklist(
  slug: string,
  view: Pick<OwnerRestaurant, "profile" | "hours" | "categories" | "items">
): ChecklistItem[] {
  const visibleItems = view.items.filter((item) => item.isPublished && item.isAvailable);
  const menuReady = view.categories.some(
    (category) =>
      category.isPublished && visibleItems.some((item) => item.categoryId === category.id)
  );
  return [
    {
      key: "profile",
      label: "Restaurant profile with a name",
      met: (view.profile?.name.trim() ?? "") !== "",
      href: `/dashboard/${slug}/profile`,
    },
    {
      key: "menu",
      label: "At least one published category with a visible item",
      met: menuReady,
      href: `/dashboard/${slug}/menu`,
    },
    {
      key: "hours",
      label: "Opening hours entered",
      met: view.hours.some((row) => row.openTime ?? row.isClosed),
      href: `/dashboard/${slug}/hours`,
    },
  ];
}
