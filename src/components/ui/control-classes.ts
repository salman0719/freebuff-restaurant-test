import { cn } from "./cn";

/** Shared base styling for Input, Select, and Textarea. */
export function controlClasses(invalid = false, className?: string): string {
  return cn(
    "block w-full rounded-lg border bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition-colors",
    "placeholder:text-muted-foreground/70",
    "focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25 focus:outline-none",
    "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground",
    invalid
      ? "border-red-600 focus:border-red-600 focus:ring-red-600/30"
      : "border-border hover:border-muted-foreground/50",
    className
  );
}
