import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Input } from "./input";
import { Label } from "./label";
import { Select } from "./select";
import { Textarea } from "./textarea";

afterEach(cleanup);

describe("Label", () => {
  it("associates with a control via htmlFor", () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" />
      </>
    );
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows a decorative required marker", () => {
    render(
      <Label htmlFor="name" required>
        Name
      </Label>
    );
    const marker = screen.getByText("*", { exact: false });
    expect(marker).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Input", () => {
  it("renders with placeholder and forwards props", () => {
    render(<Input placeholder="you@example.com" name="email" />);
    expect(screen.getByPlaceholderText("you@example.com")).toHaveAttribute("name", "email");
  });

  it("marks invalid state for assistive tech", () => {
    render(<Input aria-label="Email" invalid />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("supports disabled state", () => {
    render(<Input aria-label="Email" disabled />);
    expect(screen.getByLabelText("Email")).toBeDisabled();
  });
});

describe("Select", () => {
  it("renders options with an accessible name", () => {
    render(
      <>
        <Label htmlFor="party-size">Party size</Label>
        <Select id="party-size" defaultValue="2">
          <option value="1">1 guest</option>
          <option value="2">2 guests</option>
        </Select>
      </>
    );
    const select = screen.getByLabelText("Party size");
    expect(select).toHaveValue("2");
    expect(screen.getByRole("option", { name: "2 guests" })).toBeInTheDocument();
  });

  it("marks invalid state for assistive tech", () => {
    render(
      <Select aria-label="Party size" invalid>
        <option value="">Choose…</option>
      </Select>
    );
    expect(screen.getByLabelText("Party size")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Textarea", () => {
  it("renders with an accessible name", () => {
    render(
      <>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" placeholder="Anything we should know?" />
      </>
    );
    expect(screen.getByPlaceholderText("Anything we should know?")).toHaveAccessibleName("Notes");
  });

  it("marks invalid state for assistive tech", () => {
    render(<Textarea aria-label="Notes" invalid />);
    expect(screen.getByLabelText("Notes")).toHaveAttribute("aria-invalid", "true");
  });
});
