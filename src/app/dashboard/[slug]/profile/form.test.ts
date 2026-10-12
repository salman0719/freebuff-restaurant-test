import { describe, expect, it } from "vitest";
import { toProfileInput } from "./form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("toProfileInput", () => {
  it("keeps typed values and maps blanks to null (clear)", () => {
    expect(toProfileInput(form({ name: "Marios", phone: "", city: "Springfield" }))).toMatchObject({
      name: "Marios",
      phone: null,
      city: "Springfield",
    });
  });

  it("drops unknown keys such as slug and logoImageKey", () => {
    const input = toProfileInput(form({ name: "Marios", slug: "marios", logoImageKey: "abc" }));
    expect(input).not.toHaveProperty("slug");
    expect(input).not.toHaveProperty("logoImageKey");
  });
});
