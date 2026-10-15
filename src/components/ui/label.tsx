import type { LabelHTMLAttributes } from "react";
import { cn } from "./cn";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Shows a decorative required marker (the control itself carries `required`). */
  required?: boolean;
}

export function Label({ required = false, className, children, ...rest }: LabelProps) {
  return (
    <label className={cn("block text-sm font-medium text-foreground/80", className)} {...rest}>
      {children}
      {required ? (
        <span aria-hidden="true" className="text-red-600 dark:text-red-400">
          {" *"}
        </span>
      ) : null}
    </label>
  );
}
