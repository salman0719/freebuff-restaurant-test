import { twMerge } from "tailwind-merge";

/**
 * Join class names, dropping falsy values, then resolve conflicting Tailwind
 * utilities so a caller's override wins over a component default. Signature is
 * unchanged from the previous hand-rolled version.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
