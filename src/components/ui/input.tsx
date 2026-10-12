import type { InputHTMLAttributes } from "react";
import { controlClasses } from "./control-classes";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Applies error styling + `aria-invalid`. Prefer <Field> to wire it up. */
  invalid?: boolean;
}

export function Input({ invalid = false, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, className)}
      {...rest}
    />
  );
}
