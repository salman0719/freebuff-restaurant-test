import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Badge } from "./badge";
import { Divider } from "./divider";
import { PageHeader } from "./page-header";
import { Stat } from "./stat";

afterEach(cleanup);

describe("Badge", () => {
  it("renders its label with a neutral tone by default", () => {
    render(<Badge>Draft</Badge>);
    const badge = screen.getByText("Draft");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-surface-muted");
  });

  it("applies the requested tone", () => {
    render(<Badge tone="success">Published</Badge>);
    expect(screen.getByText("Published").className).toContain("bg-green-50");
  });
});

describe("Divider", () => {
  it("renders a semantic separator", () => {
    render(<Divider data-testid="divider" />);
    const divider = screen.getByTestId("divider");
    expect(divider.tagName).toBe("HR");
    expect(divider.className).toContain("border-border");
  });
});

describe("Stat", () => {
  it("shows the label, value, and hint", () => {
    render(<Stat label="Menu" value="12" hint="3 categories" />);
    expect(screen.getByText("Menu")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3 categories")).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("renders a level-1 heading with optional eyebrow and description", () => {
    render(
      <PageHeader
        eyebrow="Restaurant"
        title="Your restaurants"
        description="Choose one to manage."
      />
    );
    expect(screen.getByRole("heading", { level: 1, name: "Your restaurants" })).toBeInTheDocument();
    expect(screen.getByText("Restaurant")).toBeInTheDocument();
    expect(screen.getByText("Choose one to manage.")).toBeInTheDocument();
  });
});
