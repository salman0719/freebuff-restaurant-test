"use client";

/**
 * Dashboard nav links (Phase B). Client-only so it can read the current
 * pathname and mark the visitor's section with `aria-current`; the parent
 * `SiteNav` stays a plain server-rendered shell that receives this as its
 * `links` slot.
 */
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import { SiteNavLink } from "@/components/ui/site-nav";
import { activeNavHref, type DashboardNavItem } from "./nav";

export function DashboardNavLinks({ items }: { items: DashboardNavItem[] }) {
  const pathname = usePathname();
  const active = activeNavHref(
    pathname,
    items.map((item) => item.href)
  );

  return (
    <>
      {items.map((item) => {
        const isActive = item.href === active;
        return (
          <SiteNavLink
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(isActive && "bg-surface-muted font-semibold text-foreground")}
          >
            {item.label}
          </SiteNavLink>
        );
      })}
    </>
  );
}
