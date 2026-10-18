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

  // `loading` sets `disabled`, and a disabled element cannot hold focus:
  // the browser drops it to <body> and nothing brings it back. Found by
  // the 6.3 keyboard sweep, which landed on <body> after a saved form.
  // jsdom does not enforce the disabled-focus rule, so the test starts
  // where a real load leaves focus — nowhere — and asserts it comes back.
  it("hands focus back when a loading round trip ends", () => {
    const { rerender } = render(<Button loading>Save changes</Button>);
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(document.activeElement).toBe(document.body);

    rerender(<Button>Save changes</Button>);

    expect(document.activeElement).toBe(button);
  });

  it("keeps focus the user moved elsewhere while the button was loading", () => {
    const view = (busy: boolean) => (
      <div>
        <Button loading={busy}>Save changes</Button>
        <input aria-label="Notes" />
      </div>
    );
    const { rerender } = render(view(true));
    const notes = screen.getByLabelText("Notes");
    notes.focus();

    rerender(view(false));

    expect(document.activeElement).toBe(notes);
  });
});
