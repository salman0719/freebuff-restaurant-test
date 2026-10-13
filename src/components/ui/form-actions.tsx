import type { ReactNode } from "react";
import { cn } from "./cn";

export interface FormActionsProps {
  children: ReactNode;
  /** Optional note shown beside the action (e.g. what saving will do). */
  hint?: ReactNode;
  className?: string;
}

/**
 * Sticky action bar for long editor forms, so the primary button stays
 * reachable while the page scrolls. Sits above the content with a blurred
 * surface so fields stay legible beneath it.
 */
export function FormActions({ children, hint, className }: FormActionsProps) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-1 mt-2 flex flex-wrap items-center gap-3 rounded-xl",
        "border border-border bg-surface/95 px-3 py-3 shadow-md backdrop-blur-md",
        className
      )}
    >
      {children}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
