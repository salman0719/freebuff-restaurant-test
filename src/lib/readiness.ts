/**
 * Shared setup-readiness rules (Phase 4.3).
 *
 * Three questions — "is there a named profile?", "is the menu entered?",
 * "are the hours entered?" — are asked by two different surfaces: the
 * owner's publishing checklist
 * (`app/dashboard/[slug]/publishing/checklist.ts`) and the operator's
 * onboarding view (`lib/onboarding.ts`). They must never disagree. An owner
 * told the menu is ready while an operator's console shows it missing is a
 * support call nobody can answer, and two copies of "menu entered" drift the
 * first time one of them is tuned.
 *
 * So the rules live here once, as pure functions over rows the caller has
 * already loaded: no I/O, no database, no theme components. Both surfaces
 * import them, and a change to what "entered" means is one edit.
 *
 * The shapes below are structural on purpose — the owner view hands over
 * Drizzle rows, the operator loader hands over narrowed selects, and neither
 * has to reshape to be checked.
 */

/** A profile counts as started once it carries a non-blank name. */
export function hasNamedProfile(profile: { name: string | null } | null): boolean {
  return (profile?.name?.trim() ?? "") !== "";
}

/**
 * The menu counts as entered when at least one PUBLISHED category holds at
 * least one item that is both published and available. A category alone, or
 * items the visitor cannot see, are not a menu.
 */
export function hasPublishedMenu(
  categories: readonly { id: string; isPublished: boolean }[],
  items: readonly { categoryId: string | null; isPublished: boolean; isAvailable: boolean }[]
): boolean {
  const visible = items.filter((item) => item.isPublished && item.isAvailable);
  return categories.some(
    (category) => category.isPublished && visible.some((item) => item.categoryId === category.id)
  );
}

/**
 * Hours count as entered when any day carries times OR is marked closed —
 * the same rule the dashboard overview card uses, so the two never disagree.
 * A day left untouched is neither.
 */
export function hasOpeningHours(
  hours: readonly { openTime: string | null; isClosed: boolean }[]
): boolean {
  return hours.some((row) => Boolean(row.openTime ?? row.isClosed));
}
