/**
 * Shared theme contract (Phase 2.2).
 *
 * Every theme is a React Server Component receiving ONE prop: the validated
 * `PublicRestaurant` view built by `src/lib/public-restaurant.ts`. Themes
 * never query the database, never read the session, and never receive
 * private data — queries and authorisation happen before the theme is
 * chosen, in Server Components and route handlers. No arbitrary
 * customer-supplied code: only components registered here can render.
 */
import type { PublicRestaurant, ThemeId } from "@/lib/restaurant";

export interface ThemeProps {
  restaurant: PublicRestaurant;
}

export type ThemeComponent = (props: ThemeProps) => React.ReactElement;

export interface ThemeDefinition {
  id: ThemeId;
  /** Display name for the dashboard theme picker (Phase 3.7). */
  label: string;
  blurb: string;
  Component: ThemeComponent;
}
