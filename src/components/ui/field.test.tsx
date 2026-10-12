import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Field } from "./field";

afterEach(cleanup);
import { Input } from "./input";
import { Textarea } from "./textarea";

describe("Field", () => {
  it("links the label to the control with a generated id", () => {
    render(
      <Field label="Email">
        <Input placeholder="you@example.com" />
      </Field>
    );
    const input = screen.getByPlaceholderText("you@example.com");
    expect(input).toHaveAccessibleName("Email");
    expect(input.id).not.toBe("");
  });

  it("announces hint text via aria-describedby", () => {
    render(
      <Field label="Email" hint="We never share your email.">
        <Input placeholder="you@example.com" />
      </Field>
    );
    const hint = screen.getByText("We never share your email.");
    const input = screen.getByPlaceholderText("you@example.com");
    expect(input.getAttribute("aria-describedby")).toContain(hint.id);
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("announces errors as an alert and marks the control invalid", () => {
    render(
      <Field label="Email" error="Email is required">
        <Input placeholder="you@example.com" />
      </Field>
    );
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Email is required");
    const input = screen.getByPlaceholderText("you@example.com");
    expect(input.getAttribute("aria-describedby")).toContain(error.id);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("combines hint and error descriptions", () => {
    render(
      <Field label="Notes" hint="Optional" error="Too long">
        <Textarea placeholder="Notes" />
      </Field>
    );
    const input = screen.getByPlaceholderText("Notes");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toContain(screen.getByText("Optional").id);
    expect(describedBy).toContain(screen.getByRole("alert").id);
  });

  it("respects an explicit htmlFor id", () => {
    render(
      <Field label="Email" htmlFor="custom-id">
        <Input placeholder="you@example.com" />
      </Field>
    );
    expect(screen.getByPlaceholderText("you@example.com")).toHaveAttribute("id", "custom-id");
  });
});
