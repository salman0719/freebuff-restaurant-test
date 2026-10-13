import { describe, expect, it } from "vitest";
import { toCreateCategoryInput, toUpdateCategoryInput } from "./form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("toCreateCategoryInput", () => {
  it("keeps typed values and maps blanks to null", () => {
    expect(toCreateCategoryInput(form({ name: "Mains", description: "" }))).toEqual({
      name: "Mains",
      description: null,
    });
  });

  it("drops unknown keys such as slug and sortOrder", () => {
    const input = toCreateCategoryInput(form({ name: "Mains", slug: "marios", sortOrder: "0" }));
    expect(input).not.toHaveProperty("slug");
    expect(input).not.toHaveProperty("sortOrder");
  });
});

describe("toUpdateCategoryInput", () => {
  it("maps a checked box to true and a missing box to false", () => {
    expect(toUpdateCategoryInput(form({ name: "Mains", isPublished: "on" })).isPublished).toBe(
      true
    );
    expect(toUpdateCategoryInput(form({ name: "Mains" })).isPublished).toBe(false);
  });

  it("maps a blank name to null so the data layer rejects the clear", () => {
    expect(toUpdateCategoryInput(form({ name: "" })).name).toBeNull();
  });
});
