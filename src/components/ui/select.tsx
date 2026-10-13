import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";
import { controlClasses } from "./control-classes";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Applies error styling + `aria-invalid`. Prefer <Field> to wire it up. */
  invalid?: boolean;
}

export function Select({ invalid = false, className, children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(controlClasses(invalid, "appearance-none pr-10"), className)}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      >
        <path
          d="m4 6 4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
