import { describe, expect, it } from "vitest";
import { parsePriceToCents, toCreateItemInput, toUpdateItemInput } from "./form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("parsePriceToCents", () => {
  it.each([
    ["12.99", 1299],
    ["12", 1200],
    ["12.9", 1290],
    ["0.99", 99],
    ["0", 0],
    [" 12.99 ", 1299],
  ])("parses %s to %i cents", (raw, cents) => {
    expect(parsePriceToCents(raw)).toBe(cents);
  });

  it.each(["", "  ", "9am", "12.999", "-5", "12,99", "abc"])("rejects %s as unparseable", (raw) => {
    expect(parsePriceToCents(raw)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(parsePriceToCents(null)).toBeNull();
    expect(parsePriceToCents(undefined)).toBeNull();
  });
});

describe("toCreateItemInput", () => {
  it("maps dollars to cents and keeps the category", () => {
    const id = "00000000-0000-0000-0000-000000000000";
    expect(toCreateItemInput(form({ name: "Pizza", price: "12.99", categoryId: id }))).toEqual({
      name: "Pizza",
      description: null,
      priceCents: 1299,
      categoryId: id,
    });
  });

  it("maps an empty category select to uncategorised", () => {
    expect(toCreateItemInput(form({ name: "Pizza", price: "5" })).categoryId).toBeNull();
  });

  it("maps an unparseable price to NaN so validation rejects it", () => {
    const input = toCreateItemInput(form({ name: "Pizza", price: "9am" }));
    expect(Number.isNaN(input.priceCents)).toBe(true);
  });

  it("drops unknown keys such as slug and imageKey", () => {
    const input = toCreateItemInput(
      form({ name: "Pizza", price: "5", slug: "marios", imageKey: "abc" })
    );
    expect(input).not.toHaveProperty("slug");
    expect(input).not.toHaveProperty("imageKey");
  });
});

describe("toUpdateItemInput", () => {
  it("maps checked boxes to true and missing boxes to false", () => {
    const checked = toUpdateItemInput(
      form({ name: "Pizza", price: "5", isPublished: "on", isAvailable: "on" })
    );
    expect(checked.isPublished).toBe(true);
    expect(checked.isAvailable).toBe(true);
    const unchecked = toUpdateItemInput(form({ name: "Pizza", price: "5" }));
    expect(unchecked.isPublished).toBe(false);
    expect(unchecked.isAvailable).toBe(false);
  });
});
