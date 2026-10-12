import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type SpinnerSize = "sm" | "md" | "lg";

const spinnerSizes: Record<SpinnerSize, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-8",
};

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** Screen-reader announcement. Defaults to "Loading…". */
  label?: string;
  size?: SpinnerSize;
}

/** Loading indicator announced to assistive tech via `role="status"`. */
export function Spinner({ label = "Loading…", size = "md", className, ...rest }: SpinnerProps) {
  return (
    <span role="status" className={cn("inline-flex items-center", className)} {...rest}>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        className={cn("animate-spin text-brand-600", spinnerSizes[size])}
      >
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M15 8a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/** Placeholder shimmer for loading content. Decorative (`aria-hidden`). */
export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800", className)}
      {...rest}
    />
  );
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** Slot: follow-up action (e.g. a Button). */
  action?: ReactNode;
}

/** Dashed placeholder for lists with zero results. */
export function EmptyState({ title, description, action, className, ...rest }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700",
        className
      )}
      {...rest}
    >
      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  message?: ReactNode;
  /** Slot: recovery action (e.g. a retry Button). */
  action?: ReactNode;
}

/** Error summary announced immediately via `role="alert"`. */
export function ErrorState({
  title = "Something went wrong",
  message,
  action,
  className,
  ...rest
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-900 dark:bg-red-950/40",
        className
      )}
      {...rest}
    >
      <p className="text-sm font-semibold text-red-800 dark:text-red-200">{title}</p>
      {message ? <p className="text-sm text-red-700 dark:text-red-300">{message}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
