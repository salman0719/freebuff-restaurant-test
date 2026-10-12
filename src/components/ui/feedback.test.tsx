import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EmptyState, ErrorState, Skeleton, Spinner } from "./feedback";

afterEach(cleanup);

describe("Spinner", () => {
  it("announces loading to assistive tech", () => {
    render(<Spinner />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent("Loading…");
  });

  it("supports a custom label and size", () => {
    render(<Spinner label="Saving menu" size="lg" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving menu");
  });
});

describe("Skeleton", () => {
  it("is decorative and hidden from assistive tech", () => {
    render(<Skeleton data-testid="skeleton" className="h-10 w-full" />);
    const skeleton = screen.getByTestId("skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton.className).toContain("animate-pulse");
  });
});

describe("EmptyState", () => {
  it("renders title, description, and action", () => {
    render(
      <EmptyState
        title="No dishes yet"
        description="Add your first dish to build the menu."
        action={<button type="button">Add dish</button>}
      />
    );
    expect(screen.getByText("No dishes yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first dish to build the menu.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add dish" })).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("announces errors immediately via role=alert", () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Menu failed to load"
        message="Check your connection and try again."
        action={
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        }
      />
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Menu failed to load");
    expect(alert).toHaveTextContent("Check your connection and try again.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
