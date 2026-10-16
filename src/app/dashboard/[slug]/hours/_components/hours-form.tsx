/**
 * Opening-hours editor form (Phase 3.3). Client component: owns the
 * `useActionState` round-trip so rejected saves keep typed input and
 * show per-day errors, and saves confirm via a `role="status"` message.
 * `slug` rides along as a hidden field for context lookup.
 *
 * Server-side errors arrive under Zod array-path keys (`"1"`,
 * `"1.openTime"`, `"_form"` for the week-level duplicate-days check);
 * each day's row collects the keys that address it.
 */
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import type { OpeningHoursRow } from "@/lib/restaurant";
import { saveHours, type HoursState } from "../actions";
import { WEEKDAY_LABELS } from "../form";

function dayErrors(fields: Record<string, string[]> | undefined, weekday: number): string[] {
  if (!fields) return [];
  const prefix = `${weekday}`;
  const messages: string[] = [];
  for (const [key, list] of Object.entries(fields)) {
    if (key === prefix || key.startsWith(`${prefix}.`)) {
      messages.push(...list);
    }
  }
  return messages;
}

export function HoursForm({ slug, hours }: { slug: string; hours: OpeningHoursRow[] }) {
  const [state, action, pending] = useActionState<HoursState, FormData>(saveHours, {
    status: "idle",
  });
  const byWeekday = new Map(hours.map((row) => [row.weekday, row]));
  const formErrors = state.fields?.["_form"];
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      {state.status === "saved" ? (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          {state.message ?? "Opening hours saved."}
        </p>
      ) : null}
      {state.status === "error" && !state.fields ? (
        <ErrorState title="Could not save the hours" message={state.message} />
      ) : null}
      {state.status === "error" && state.fields ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message ?? "Check the highlighted days and try again."}
        </p>
      ) : null}
      {formErrors?.map((message) => (
        <p key={message} role="alert" className="text-sm text-red-600">
          {message}
        </p>
      ))}
      <ul className="flex flex-col gap-3">
        {WEEKDAY_LABELS.map((label, weekday) => {
          const stored = byWeekday.get(weekday);
          const echo = state.values?.[weekday];
          const closed = echo?.closed ?? stored?.isClosed ?? true;
          const openTime = echo?.openTime ?? stored?.openTime ?? "";
          const closeTime = echo?.closeTime ?? stored?.closeTime ?? "";
          const errors = dayErrors(state.fields, weekday);
          const errorId = errors.length > 0 ? `hours-${weekday}-error` : undefined;
          return (
            <li key={label} className="rounded-lg border border-border px-4 py-3">
              <fieldset>
                <legend className="px-1 text-sm font-semibold text-foreground">{label}</legend>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex min-h-6 items-center gap-2 text-sm text-foreground/80">
                    <input
                      type="checkbox"
                      name={`closed-${weekday}`}
                      defaultChecked={closed}
                      className="h-4 w-4 accent-brand-600"
                    />
                    Closed
                  </label>
                  <label className="flex min-h-6 items-center gap-2 text-sm text-foreground/80">
                    Opens
                    <Input
                      type="time"
                      name={`open-${weekday}`}
                      defaultValue={openTime}
                      aria-describedby={errorId}
                      aria-invalid={errors.length > 0 || undefined}
                      className="w-32"
                    />
                  </label>
                  <label className="flex min-h-6 items-center gap-2 text-sm text-foreground/80">
                    Closes
                    <Input
                      type="time"
                      name={`close-${weekday}`}
                      defaultValue={closeTime}
                      aria-describedby={errorId}
                      aria-invalid={errors.length > 0 || undefined}
                      className="w-32"
                    />
                  </label>
                </div>
                {errors.length > 0 ? (
                  <p
                    id={errorId}
                    role="alert"
                    className="mt-2 text-sm text-red-600 dark:text-red-400"
                  >
                    {errors.join(" ")}
                  </p>
                ) : null}
              </fieldset>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">
        Overnight hours are allowed — for example 18:00 to 02:00. Days with no saved times yet start
        as closed; the public site lists exactly what is saved here.
      </p>
      <FormActions hint="Saves the whole week at once.">
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : "Save hours"}
        </Button>
      </FormActions>
    </form>
  );
}
