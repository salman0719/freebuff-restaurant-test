import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RestaurantLoading } from "./restaurant-loading";

describe("RestaurantLoading", () => {
  it("announces once while keeping decoration silent", () => {
    const { container } = render(<RestaurantLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading restaurant");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});
