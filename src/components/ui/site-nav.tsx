"use client";

import { useId, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";
import { Container } from "./container";
export type SiteNavLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

/** Nav link styling for use inside the `links` slot. */
export function SiteNavLink({ className, children, ...rest }: SiteNavLinkProps) {
  return (
    <a
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors",
        "hover:bg-zinc-100 hover:text-zinc-900",
        "focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:outline-none",
        "dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        className
      )}
      {...rest}
    >
      {children}
    </a>
  );
}

export interface SiteNavProps {
  /** Slot: brand mark / wordmark (usually a home link). */
  brand: ReactNode;
  /** Slot: primary links (use <SiteNavLink>). */
  links?: ReactNode;
  /** Slot: trailing actions (e.g. sign-in button). */
  actions?: ReactNode;
  /** Accessible label for the navigation landmarks. */
  label?: string;
  className?: string;
}

/**
 * Sticky site header with `brand` / `links` / `actions` slots.
 * Links collapse behind an expandable menu button on mobile.
 */
export function SiteNav({ brand, links, actions, label = "Site", className }: SiteNavProps) {
  const [open, setOpen] = useState(false);
  const menuId = `site-nav-${useId().replace(/:/g, "")}`;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-zinc-200 bg-background/95 backdrop-blur dark:border-zinc-800",
        className
      )}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-6">
          <div className="shrink-0">{brand}</div>
          {links ? (
            <nav aria-label={label} className="hidden md:block">
              <div className="flex items-center gap-1">{links}</div>
            </nav>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {actions ? <div className="hidden items-center gap-2 md:flex">{actions}</div> : null}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center justify-center rounded-md p-2 text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:outline-none md:hidden dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
              {open ? (
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 5h14M3 10h14M3 15h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </Container>
      <div
        id={menuId}
        className={cn(
          "border-t border-zinc-200 md:hidden dark:border-zinc-800",
          open ? "block" : "hidden"
        )}
      >
        <Container className="flex flex-col gap-1 py-4">
          {links ? (
            <nav aria-label={`${label} mobile`} className="flex flex-col gap-1">
              {links}
            </nav>
          ) : null}
          {actions ? <div className="mt-2 flex flex-col gap-2">{actions}</div> : null}
        </Container>
      </div>
    </header>
  );
}
