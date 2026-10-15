import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type DividerProps = HTMLAttributes<HTMLHRElement>;

/** Thin horizontal rule for separating groups of content. */
export function Divider({ className, ...rest }: DividerProps) {
  return <hr className={cn("border-0 border-t border-border", className)} {...rest} />;
}
