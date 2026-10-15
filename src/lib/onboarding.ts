/**
 * Operator onboarding checklist (Phase 4.3). Pure — no I/O, unit-tested
 * directly. The loader that fills `TenantSetupState` lives in
 * `operator-tenants.ts`; this module only decides what the facts mean.
 *
 * Scope, deliberately narrow: this tracks setup the platform can OBSERVE, so
 * an operator chasing a half-finished restaurant can see which step is
 * missing and who to nudge. It is not a workflow engine — no assignments, no
 * notifications, no completion timestamps. Every step is derived from a row
 * that already exists, so there is nothing here to keep in sync.
 *
 * Three rules the steps obey:
 *
 * - **`required` is stated here, once.** An operator scanning a list needs to
 *   know which gaps actually block a usable site, and a console that decides
 *   that for itself would drift from the checklist it sits beside. Required
 *   steps are the ones a visitor would notice as missing; the theme is a
 *   report and a custom domain is a Phase 5 option, so neither blocks.
 * - **Nothing claims more than it knows.** "Custom domain" reports that a
 *   domain is RECORDED, not that it works: verification and HTTPS are Phase
 *   5, and 5.3 is explicit that a domain must not be called live until
 *   routing and TLS do.
 * - **Shared rules are shared.** Profile/menu/hours use the predicates in
 *   `lib/readiness.ts`, the same ones the owner's publishing checklist uses,
 *   so the owner and the operator can never be told different things.
 */
import type { ThemeId } from "../../db/constants";
import { hasNamedProfile, hasOpeningHours, hasPublishedMenu } from "./readiness";

export type OnboardingStepKey =
  "profile" | "menu" | "hours" | "theme" | "owner" | "domain" | "published";

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  met: boolean;
  /** Short factual readout shown either way, so a met step still informs. */
  detail: string;
  /** Whether a gap here blocks a usable public site (see the module note). */
  required: boolean;
}

/**
 * Everything the checklist needs, already loaded and already scoped to one
 * tenant. The caller resolves the theme's display label so this module stays
 * free of the theme components.
 */
export interface TenantSetupState {
  theme: ThemeId;
  themeLabel: string;
  published: boolean;
  customDomain: string | null;
  profile: { name: string | null } | null;
  menu: {
    categories: readonly { id: string; isPublished: boolean }[];
    items: readonly { categoryId: string | null; isPublished: boolean; isAvailable: boolean }[];
  };
  hours: readonly { openTime: string | null; isClosed: boolean }[];
  ownerCount: number;
}

/** What the public site is missing, in the order a support call would fix it. */
export function getOnboardingSteps(state: TenantSetupState): OnboardingStep[] {
  const visibleItemCount = state.menu.items.filter(
    (item) => item.isPublished && item.isAvailable
  ).length;
  const owners = state.ownerCount;
  return [
    {
      key: "profile",
      label: "Restaurant profile",
      met: hasNamedProfile(state.profile),
      detail: hasNamedProfile(state.profile) ? "Named" : "Not started",
      required: true,
    },
    {
      key: "menu",
      label: "Menu entered",
      met: hasPublishedMenu(state.menu.categories, state.menu.items),
      detail:
        visibleItemCount === 0
          ? "Nothing visible to visitors yet"
          : `${visibleItemCount} item${visibleItemCount === 1 ? "" : "s"} visible`,
      required: true,
    },
    {
      key: "hours",
      label: "Opening hours",
      met: hasOpeningHours(state.hours),
      detail: hasOpeningHours(state.hours) ? "Week entered" : "Not entered",
      required: true,
    },
    {
      // The tenant row cannot distinguish "chose café" from "never chose":
      // `theme` is NOT NULL with a platform default and 4.2 writes an explicit
      // value at creation. So this step reports WHICH theme rather than gating
      // on a decision nothing records, and it is never the step that blocks a
      // tenant.
      key: "theme",
      label: "Theme selected",
      met: true,
      detail: state.themeLabel,
      required: false,
    },
    {
      key: "owner",
      label: "Owner access",
      met: owners > 0,
      detail:
        owners === 0 ? "No owner assigned" : `${owners} ${owners === 1 ? "person" : "people"}`,
      required: true,
    },
    {
      key: "domain",
      label: "Custom domain",
      met: state.customDomain !== null,
      // Recorded, not verified — see the module note. Optional because the
      // platform address works, and custom domains are Phase 5.
      detail: state.customDomain ?? "Platform address only",
      required: false,
    },
    {
      key: "published",
      label: "Website published",
      met: state.published,
      detail: state.published ? "Live" : "Draft",
      required: true,
    },
  ];
}

export interface OnboardingSummary {
  met: number;
  total: number;
  complete: boolean;
}

export function summariseOnboarding(steps: readonly OnboardingStep[]): OnboardingSummary {
  const met = steps.filter((step) => step.met).length;
  return { met, total: steps.length, complete: met === steps.length };
}

/** Every step still to do, in checklist order. */
export function unmetOnboardingSteps(steps: readonly OnboardingStep[]): OnboardingStep[] {
  return steps.filter((step) => !step.met);
}

/**
 * The gaps that actually block a usable site — unmet AND required. This is
 * what a console summarises and badges; the full checklist shows the rest.
 * A tenant with nothing outstanding is ready for customers, even if it never
 * records a custom domain or changes its theme.
 */
export function outstandingOnboardingSteps(steps: readonly OnboardingStep[]): OnboardingStep[] {
  return steps.filter((step) => step.required && !step.met);
}

/** Whether anything blocks this restaurant from being usable. */
export function hasOutstandingSetup(steps: readonly OnboardingStep[]): boolean {
  return outstandingOnboardingSteps(steps).length > 0;
}
