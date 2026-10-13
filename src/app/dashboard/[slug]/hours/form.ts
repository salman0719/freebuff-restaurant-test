/**
 * Pure hours-form mapping (Phase 3.3). Lives outside `actions.ts`
 * because `"use server"` modules may only export async functions
 * (same lesson as 3.1/3.2).
 *
 * The form posts one row per weekday: `closed-{d}` (checkbox, present
 * only when checked), `open-{d}` / `close-{d}` (`HH:MM` time inputs).
 * Closed days map to no times — never ambiguous `"00:00"` stand-ins;
 * open days pass the raw strings through so `updateHoursSchema` reports
 * malformed or missing times instead of silently coercing them.
 */

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export interface HoursDayInput {
  weekday: number;
  isClosed: boolean;
  openTime: string | undefined;
  closeTime: string | undefined;
}

function timeOrUndefined(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  return typeof raw === "string" && raw !== "" ? raw : undefined;
}

export function toHoursInput(formData: FormData): HoursDayInput[] {
  return WEEKDAY_LABELS.map((_, weekday) => {
    const isClosed = formData.get(`closed-${weekday}`) !== null;
    if (isClosed) {
      return { weekday, isClosed: true, openTime: undefined, closeTime: undefined };
    }
    return {
      weekday,
      isClosed: false,
      openTime: timeOrUndefined(formData, `open-${weekday}`),
      closeTime: timeOrUndefined(formData, `close-${weekday}`),
    };
  });
}
