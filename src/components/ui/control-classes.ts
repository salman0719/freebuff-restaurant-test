import { cn } from "./cn";

/** Shared base styling for Input, Select, and Textarea. */
export function controlClasses(invalid = false, className?: string): string {
  return cn(
    "block w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition-colors",
    "placeholder:text-zinc-400",
    "focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 focus:outline-none",
    "disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500",
    "dark:bg-zinc-900 dark:text-zinc-50 dark:disabled:bg-zinc-800",
    invalid
      ? "border-red-600 focus:border-red-600 focus:ring-red-600/30"
      : "border-zinc-300 dark:border-zinc-700",
    className
  );
}
