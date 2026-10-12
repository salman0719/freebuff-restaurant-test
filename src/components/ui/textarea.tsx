import type { TextareaHTMLAttributes } from "react";
import { controlClasses } from "./control-classes";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Applies error styling + `aria-invalid`. Prefer <Field> to wire it up. */
  invalid?: boolean;
}

export function Textarea({ invalid = false, className, ...rest }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, `min-h-24 resize-y ${className ?? ""}`)}
      {...rest}
    />
  );
}
