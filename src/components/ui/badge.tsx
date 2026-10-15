import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-muted-foreground ring-border",
  brand:
    "bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-950/50 dark:text-brand-300 dark:ring-brand-900",
  success:
    "bg-green-50 text-green-800 ring-green-200 dark:bg-green-950/40 dark:text-green-300 dark:ring-green-900/60",
  warning:
    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/60",
  danger:
    "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Semantic color treatment. Defaults to neutral. */
  tone?: BadgeTone;
}

/** Compact status pill (e.g. Published / Draft / Current). */
export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClasses[tone],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
