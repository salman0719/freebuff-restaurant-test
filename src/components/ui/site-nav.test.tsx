import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SiteNav, SiteNavLink } from "./site-nav";

afterEach(cleanup);

function renderNav() {
  return render(
    <SiteNav
      brand={<a href="#home">Bistro</a>}
      links={
        <>
          <SiteNavLink href="/menu">Menu</SiteNavLink>
          <SiteNavLink href="/about">About</SiteNavLink>
        </>
      }
      actions={<a href="/login">Sign in</a>}
    />
  );
}

describe("SiteNav", () => {
  it("renders brand, links, and actions", () => {
    renderNav();
    expect(screen.getByRole("link", { name: "Bistro" })).toHaveAttribute("href", "#home");
    // Links and actions render in both the desktop bar and the mobile panel.
    expect(screen.getAllByRole("link", { name: "Menu" })).toHaveLength(2);
    const signInLinks = screen.getAllByRole("link", { name: "Sign in" });
    expect(signInLinks).toHaveLength(2);
    for (const link of signInLinks) {
      expect(link).toHaveAttribute("href", "/login");
    }
  });

  it("exposes labelled navigation landmarks", () => {
    renderNav();
    expect(screen.getByRole("navigation", { name: "Site" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Site mobile" })).toBeInTheDocument();
  });

  it("keeps the mobile menu collapsed until toggled", () => {
    renderNav();
    const toggle = screen.getByRole("button", { name: "Open menu" });
    const panelId = toggle.getAttribute("aria-controls") ?? "";
    expect(panelId).not.toBe("");
    const panel = document.getElementById(panelId);
    expect(panel?.classList.contains("hidden")).toBe(true);

    fireEvent.click(toggle);

    const closeToggle = screen.getByRole("button", { name: "Close menu" });
    expect(closeToggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(panelId)?.classList.contains("hidden")).toBe(false);
  });

  it("supports a custom landmark label", () => {
    render(
      <SiteNav
        brand={<a href="#home">Bistro</a>}
        label="Primary"
        links={<SiteNavLink href="/menu">Menu</SiteNavLink>}
      />
    );
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });
});
