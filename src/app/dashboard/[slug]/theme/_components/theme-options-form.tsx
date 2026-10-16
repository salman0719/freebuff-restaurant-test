"use client";

/**
 * Theme options form (Phase C). Client component: owns the
 * `useActionState` round-trip so saves confirm inline and failures surface
 * instead of silently doing nothing.
 *
 * Accents and layouts arrive as props from the server page rather than being
 * imported from `@/themes/config`, so the client bundle never pulls in Zod.
 */
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ErrorState } from "@/components/ui/feedback";
import { FormActions } from "@/components/ui/form-actions";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { saveThemeOptions, type ThemeOptionsState } from "../actions";

/**
 * Swatch colours, mirroring each palette's band fill in
 * `themes/sections.tsx`. Every accent a theme can select needs an entry —
 * a missing one silently fell back to a grey dot, which is how the bistro
 * and diner accents were shipping.
 */
const SWATCH: Record<string, string> = {
  espresso: "bg-amber-950",
  terracotta: "bg-orange-950",
  tomato: "bg-red-900",
  chili: "bg-red-800",
  charcoal: "bg-zinc-900",
  gold: "bg-yellow-800",
  plum: "bg-purple-900",
  navy: "bg-slate-900",
  sage: "bg-lime-900",
  cherry: "bg-cherry-700",
  butter: "bg-butter-400",
  cola: "bg-cola-900",
  fern: "bg-green-900",
  brook: "bg-teal-900",
  celery: "bg-green-200",
};

export interface ThemeOptionsFormProps {
  slug: string;
  accents: readonly string[];
  layouts: readonly string[];
  current: {
    accent: string;
    menuLayout: string;
    /** Name of the theme's own visibility toggle, e.g. `showHours`. */
    toggleName: string;
    toggleLabel: string;
    toggleChecked: boolean;
  };
}

export function ThemeOptionsForm({ slug, accents, layouts, current }: ThemeOptionsFormProps) {
  const [state, action, pending] = useActionState<ThemeOptionsState, FormData>(saveThemeOptions, {
    status: "idle",
  });
  return (
    <form
      action={action}
      className="flex max-w-2xl flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm"
    >
      <input type="hidden" name="slug" value={slug} />
      {state.status === "saved" ? (
        <p
          role="status"
          className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300"
        >
          {state.message ?? "Theme options saved."}
        </p>
      ) : null}
      {state.status === "error" ? (
        <ErrorState title="Could not save the options" message={state.message} />
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground/80">Accent</legend>
        <div className="flex flex-wrap gap-3">
          {accents.map((accent) => (
            <label
              key={accent}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground/80 hover:bg-surface-muted focus-within:ring-2 focus-within:ring-ring"
            >
              <input
                type="radio"
                name="accent"
                value={accent}
                defaultChecked={accent === current.accent}
                className="size-4 accent-brand-600"
              />
              <span
                aria-hidden="true"
                className={cn("size-3.5 rounded-full", SWATCH[accent] ?? "bg-zinc-500")}
              />
              <span className="capitalize">{accent}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme-menu-layout">Menu layout</Label>
        <Select id="theme-menu-layout" name="menuLayout" defaultValue={current.menuLayout}>
          {layouts.map((layout) => (
            <option key={layout} value={layout}>
              {layout}
            </option>
          ))}
        </Select>
        <p className="text-sm text-muted-foreground">
          Editorial is spacious, compact is dense, grid is a two-column card list.
        </p>
      </div>

      <label className="flex min-h-6 items-center gap-2 text-sm text-foreground/80">
        <input
          type="checkbox"
          name={current.toggleName}
          defaultChecked={current.toggleChecked}
          className="size-4 accent-brand-600"
        />
        {current.toggleLabel}
      </label>

      <FormActions hint="Applies to the theme currently selected.">
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : "Save options"}
        </Button>
      </FormActions>
    </form>
  );
}
