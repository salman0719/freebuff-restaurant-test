import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Field } from "./field";

afterEach(cleanup);
import Image from "next/image";
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

  // The dashboard's image fields hold a preview and a hint around their
  // input; before this, the label's `for` pointed at an id nothing had —
  // so the file input was unnamed for screen readers and for a keyboard
  // user tabbing into it (found by the 6.3 keyboard sweep).
  it("wires the label when the field carries decoration around its control", () => {
    render(
      <Field label="Logo" hint="JPEG, PNG, or WebP." error="Logo is too large">
        <Image src="/logo.png" alt="Current logo" width={96} height={96} />
        <Input name="logo" type="file" />
        <p>Select the file again — browsers do not keep it after a failed save.</p>
      </Field>
    );
    const input = screen.getByLabelText("Logo");
    expect(input).toHaveAttribute("type", "file");
    expect(input.getAttribute("aria-describedby")).toContain(
      screen.getByText("JPEG, PNG, or WebP.").id
    );
    expect(input.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").id);
    expect(input).toHaveAttribute("aria-invalid", "true");
    // Decoration keeps no part of the wiring.
    expect(screen.getByAltText("Current logo")).not.toHaveAttribute("id", input.id);
  });

  it("picks the named control over a nested labelled checkbox", () => {
    render(
      <Field label="Photo">
        <Input name="photo" type="file" />
        <label>
          <Input name="removePhoto" type="checkbox" /> Remove the current photo
        </label>
      </Field>
    );
    expect(screen.getByLabelText("Photo")).toHaveAttribute("name", "photo");
    expect(screen.getByLabelText(/Remove the current photo/)).toHaveAttribute(
      "name",
      "removePhoto"
    );
  });
});
