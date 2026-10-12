/** Join class names, dropping falsy values. Tailwind-only, no deps. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
