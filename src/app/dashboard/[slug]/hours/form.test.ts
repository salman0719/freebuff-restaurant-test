import { describe, expect, it } from "vitest";
import { toHoursInput } from "./form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

/** A full open week: every day 09:00–17:00. */
function openWeek(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let day = 0; day < 7; day += 1) {
    entries[`open-${day}`] = "09:00";
    entries[`close-${day}`] = "17:00";
  }
  return entries;
}

describe("toHoursInput", () => {
  it("covers all seven weekdays in order", () => {
    const days = toHoursInput(form(openWeek()));
    expect(days.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days.every((day) => !day.isClosed)).toBe(true);
  });

  it("maps a checked closed box to a closed day with no times", () => {
    const days = toHoursInput(form({ ...openWeek(), "closed-0": "on" }));
    expect(days[0]).toEqual({
      weekday: 0,
      isClosed: true,
      openTime: undefined,
      closeTime: undefined,
    });
    expect(days[1]?.isClosed).toBe(false);
  });

  it("maps missing times to undefined so validation reports them", () => {
    const days = toHoursInput(form({}));
    expect(days[3]).toEqual({
      weekday: 3,
      isClosed: false,
      openTime: undefined,
      closeTime: undefined,
    });
  });

  it("drops unknown keys such as slug", () => {
    const days = toHoursInput(form({ ...openWeek(), slug: "marios" }));
    expect(days).toHaveLength(7);
    for (const day of days) {
      expect(day).not.toHaveProperty("slug");
    }
  });
});
