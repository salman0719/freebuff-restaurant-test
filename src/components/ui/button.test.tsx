import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button, buttonClasses } from "./button";

afterEach(cleanup);

describe("Button", () => {
  it("renders with an accessible name", () => {
    render(<Button>Save changes</Button>);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("calls onClick when activated", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Click me" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables the button and announces busy state when loading", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("forwards the type attribute", () => {
    render(<Button type="submit">Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "submit");
  });

  it("supports an explicit disabled state", () => {
    render(<Button disabled>Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("shares styling with links via buttonClasses", () => {
    expect(buttonClasses({ variant: "danger" })).toContain("bg-red-600");
    expect(buttonClasses({ variant: "ghost", size: "sm" })).toContain("h-8");
    expect(buttonClasses({ fullWidth: true })).toContain("w-full");
  });
});
