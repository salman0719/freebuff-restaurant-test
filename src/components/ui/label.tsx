import type { LabelHTMLAttributes } from "react";
import { cn } from "./cn";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Shows a decorative required marker (the control itself carries `required`). */
  required?: boolean;
}

export function Label({ required = false, className, children, ...rest }: LabelProps) {
  return (
    <label
      className={cn("block text-sm font-medium text-zinc-700 dark:text-zinc-200", className)}
      {...rest}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="text-red-600">
          {" *"}
        </span>
      ) : null}
    </label>
  );
}
