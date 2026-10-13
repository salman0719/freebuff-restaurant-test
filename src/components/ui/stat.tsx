import type { ReactNode } from "react";
import { cn } from "./cn";

export interface StatProps {
  /** Short uppercase label describing the metric. */
  label: ReactNode;
  /** The headline value. */
  value: ReactNode;
  /** Optional supporting line beneath the value. */
  hint?: ReactNode;
  /** Optional leading icon (rendered inside a tinted tile). */
  icon?: ReactNode;
  className?: string;
}

/** Compact metric card used across the dashboard. */
export function Stat({ label, value, hint, icon, className }: StatProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm",
        className
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold text-foreground tabular-nums">
          {value}
        </p>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
