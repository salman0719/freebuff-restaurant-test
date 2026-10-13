import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Card, CardContent, CardTitle } from "./card";

afterEach(cleanup);
import { Container, Section, Stack } from "./container";
import { Eyebrow, Heading, Text } from "./typography";

describe("layout primitives", () => {
  it("Container centers content with responsive gutters", () => {
    render(<Container data-testid="container">Hello</Container>);
    const container = screen.getByTestId("container");
    expect(container).toHaveTextContent("Hello");
    expect(container.className).toContain("max-w-7xl");
    expect(container.className).toContain("mx-auto");
  });

  it("Section renders a landmark with vertical rhythm", () => {
    render(
      <Section aria-label="Menu">
        <p>Items</p>
      </Section>
    );
    expect(screen.getByRole("region", { name: "Menu" })).toHaveTextContent("Items");
  });

  it("Stack arranges children vertically", () => {
    render(
      <Stack data-testid="stack">
        <span>a</span>
        <span>b</span>
      </Stack>
    );
    expect(screen.getByTestId("stack").className).toContain("flex-col");
  });
});

describe("typography", () => {
  it("Heading renders the requested level", () => {
    const { rerender } = render(<Heading level={1}>Our story</Heading>);
    expect(screen.getByRole("heading", { level: 1, name: "Our story" })).toBeInTheDocument();
    rerender(<Heading level={3}>Hours</Heading>);
    expect(screen.getByRole("heading", { level: 3, name: "Hours" })).toBeInTheDocument();
  });

  it("Text supports muted tone", () => {
    render(<Text muted>Closed Mondays</Text>);
    const text = screen.getByText("Closed Mondays");
    expect(text.tagName).toBe("P");
    expect(text.className).toContain("text-muted-foreground");
  });

  it("Eyebrow renders a kicker", () => {
    render(<Eyebrow>Est. 2026</Eyebrow>);
    expect(screen.getByText("Est. 2026").className).toContain("uppercase");
  });
});

describe("Card", () => {
  it("groups title and content", () => {
    render(
      <Card>
        <CardTitle>Tonight&apos;s specials</CardTitle>
        <CardContent>
          <p>Truffle risotto</p>
        </CardContent>
      </Card>
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Tonight's specials" })
    ).toBeInTheDocument();
    expect(screen.getByText("Truffle risotto")).toBeInTheDocument();
  });
});
