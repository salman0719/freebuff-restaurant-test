/**
 * Large-menu rendering (Phase 6.3). jsdom — no layout, no paint, so this
 * is not a benchmark of pixels; what it guards is that the row-to-DOM
 * mapping stays complete and linear for every layout a theme can pick.
 *
 * A real pilot menu sits well under 100 items, so 100 is the ceiling worth
 * testing: if a change makes rendering quadratic (a filter per row over
 * the whole list, an unstable key scheme, a duplicated subtree), it shows
 * here as time or as a React `console.error`, long before an owner with a
 * 60-dish menu notices a sluggish page. Query shape at scale lives in
 * `src/lib/public-menu-scale.test.ts` instead — this is the view half.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicMenuCategory } from "@/lib/restaurant";
import type { MenuLayout } from "./config";
import { MENU_LAYOUTS } from "./config";
import { MenuSection } from "./sections";

const CATEGORIES = 2;
const ITEMS_PER_CATEGORY = 50;
const TOTAL_ITEMS = CATEGORIES * ITEMS_PER_CATEGORY;
/** Smoke ceiling, not a benchmark — see the file header. */
const RENDER_BUDGET_MS = 2_000;

function bigMenu(): PublicMenuCategory[] {
  return Array.from({ length: CATEGORIES }, (_, category) => ({
    id: `cat_${category}`,
    name: `Section ${category + 1}`,
    description: null,
    items: Array.from({ length: ITEMS_PER_CATEGORY }, (_, index) => ({
      id: `item_${category}_${index}`,
      name: `Dish ${category}-${index}`,
      // Half with copy, half without: the long row is the one that has to
      // wrap, and the short one has to keep its layout without it.
      description:
        index % 2 === 0
          ? "Slow-cooked through the afternoon, served the way the kitchen eats it."
          : null,
      priceCents: 1_000 + index,
      imageKey: null,
    })),
  }));
}

afterEach(cleanup);

describe.each(MENU_LAYOUTS)("MenuSection with a %s layout and 100 items", (layout: MenuLayout) => {
  it("renders every item exactly once, within a smoke ceiling", () => {
    // React reports duplicate keys and tree problems here rather than
    // throwing, so a clean render has to mean a clean console.
    const problems: string[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      problems.push(args.map((arg) => String(arg)).join(" "));
    });

    const started = performance.now();
    render(<MenuSection menu={bigMenu()} accent="tomato" layout={layout} />);
    const elapsed = performance.now() - started;
    consoleError.mockRestore();

    expect(screen.getAllByRole("listitem")).toHaveLength(TOTAL_ITEMS);
    expect(screen.getByRole("heading", { name: "Section 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Section 2" })).toBeInTheDocument();
    // One element per item, not one per (item × description) or per repeat.
    expect(screen.getAllByText(/Dish \d+-\d+/)).toHaveLength(TOTAL_ITEMS);
    expect(problems).toEqual([]);
    expect(elapsed).toBeLessThan(RENDER_BUDGET_MS);
  });
});
