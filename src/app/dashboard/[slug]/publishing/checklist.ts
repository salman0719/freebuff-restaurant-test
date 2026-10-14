/**
 * Publishing readiness checklist (Phase 3.8). Pure — unit-tested, no I/O.
 *
 * Advisory only, never blocking: publishing stays one click because the
 * MVP has no content requirements for going live (an owner may publish a
 * landing page before the menu exists). Unmet items link to the editor
 * that fixes them.
 *
 * The three rules themselves live in `@/lib/readiness`, NOT here: the
 * operator's onboarding view (4.3) asks the same questions about the same
 * tenants, and an owner shown "menu ready" while an operator's console shows
 * it missing is a support call nobody can answer. One definition, two
 * surfaces.
 */
import type { OwnerRestaurant } from "@/lib/restaurant";
import { hasNamedProfile, hasOpeningHours, hasPublishedMenu } from "@/lib/readiness";

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
  return [
    {
      key: "profile",
      label: "Restaurant profile with a name",
      met: hasNamedProfile(view.profile),
      href: `/dashboard/${slug}/profile`,
    },
    {
      key: "menu",
      label: "At least one published category with a visible item",
      met: hasPublishedMenu(view.categories, view.items),
      href: `/dashboard/${slug}/menu`,
    },
    {
      key: "hours",
      label: "Opening hours entered",
      met: hasOpeningHours(view.hours),
      href: `/dashboard/${slug}/hours`,
    },
  ];
}
