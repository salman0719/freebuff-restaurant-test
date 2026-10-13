/**
 * Restaurant switcher (Phase B). Multi-restaurant owners otherwise have no
 * way to move between their sites without going back through the landing
 * page. Server-rendered `<details>` keeps this zero-JS; a single-restaurant
 * owner just sees the plain name.
 *
 * Labels use tenant slugs, matching the landing page — resolving each
 * restaurant's display name would mean one profile query per row.
 */
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";

export interface SwitcherRestaurant {
  slug: string;
  published: boolean;
}

export function RestaurantSwitcher({
  currentLabel,
  currentSlug,
  restaurants,
}: {
  currentLabel: string;
  currentSlug: string;
  restaurants: SwitcherRestaurant[];
}) {
  if (restaurants.length <= 1) {
    return (
      <span className="max-w-40 truncate text-sm font-semibold text-foreground">
        {currentLabel}
      </span>
    );
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-foreground hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="max-w-40 truncate">{currentLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <ul className="absolute left-0 z-50 mt-1 w-60 rounded-xl border border-border bg-surface p-1 shadow-lg">
        {restaurants.map((restaurant) => {
          const current = restaurant.slug === currentSlug;
          return (
            <li key={restaurant.slug}>
              <Link
                href={`/dashboard/${restaurant.slug}`}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm",
                  current
                    ? "bg-surface-muted font-medium text-foreground"
                    : "text-foreground/80 hover:bg-surface-muted hover:text-foreground"
                )}
              >
                <span className="truncate">{restaurant.slug}</span>
                {restaurant.published ? null : (
                  <span className="shrink-0 text-xs text-muted-foreground">Draft</span>
                )}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href="/dashboard"
            className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          >
            All restaurants
          </Link>
        </li>
      </ul>
    </details>
  );
}
