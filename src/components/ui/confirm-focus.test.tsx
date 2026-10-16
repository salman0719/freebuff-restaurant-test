import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Button } from "./button";
import { useConfirmFocus } from "./confirm-focus";

afterEach(cleanup);

/** The dashboard's two-step pattern, with the real button component. */
function TwoStep({ onConfirm = () => {} }: { onConfirm?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const { triggerRef, cancelRef } = useConfirmFocus(confirming);
  return confirming ? (
    <div>
      <Button variant="danger" onClick={onConfirm}>
        Confirm delete
      </Button>
      <Button ref={cancelRef} variant="outline" onClick={() => setConfirming(false)}>
        Keep item
      </Button>
    </div>
  ) : (
    <Button ref={triggerRef} variant="outline" onClick={() => setConfirming(true)}>
      Delete item…
    </Button>
  );
}

describe("useConfirmFocus", () => {
  it("leaves focus alone when it mounts", () => {
    render(<TwoStep />);
    expect(screen.getByRole("button", { name: "Delete item…" })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  // The swap unmounts the focused trigger, so without this the browser
  // hands focus to <body> and the next Tab restarts at the top of the
  // page — measured by the 6.3 keyboard sweep, both opening and cancelling.
  it("focuses the safe choice when the confirmation opens", () => {
    render(<TwoStep />);
    const trigger = screen.getByRole("button", { name: "Delete item…" });
    fireEvent.click(trigger);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep item" }));
    // Not the destructive one: a stray Enter must never delete.
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Confirm delete" }));
  });

  it("returns focus to the trigger when the confirmation is cancelled", () => {
    render(<TwoStep />);
    fireEvent.click(screen.getByRole("button", { name: "Delete item…" }));
    expect(screen.queryByRole("button", { name: "Delete item…" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep item" }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete item…" }));
    expect(screen.queryByRole("button", { name: "Confirm delete" })).not.toBeInTheDocument();
  });

  it("cancels without ever reaching the destructive action", () => {
    const onConfirm = vi.fn();
    render(<TwoStep onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete item…" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep item" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
