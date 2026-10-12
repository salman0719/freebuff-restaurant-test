import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "./cn";
import { Label } from "./label";

type InjectedControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  invalid?: boolean;
};

export interface FieldProps {
  /** Label text for the control. */
  label: ReactNode;
  /** A single form control (Input, Select, or Textarea). */
  children: ReactNode;
  /** Helper text announced via `aria-describedby`. */
  hint?: ReactNode;
  /** Error text rendered with `role="alert"`; marks the control invalid. */
  error?: ReactNode;
  /** Shows a required marker on the label. */
  required?: boolean;
  /** Override the auto-generated control id. */
  htmlFor?: string;
  className?: string;
}

/**
 * Wires a label, hint, and error to a single form control:
 * generates an id, links `htmlFor`, and sets `aria-describedby` /
 * `aria-invalid` automatically. Mobile-first stacked layout.
 */
export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  htmlFor,
  className,
}: FieldProps) {
  const autoId = useId().replace(/:/g, "");
  const controlId = htmlFor ?? `field-${autoId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement<InjectedControlProps>(children)
    ? cloneElement(children as ReactElement<InjectedControlProps>, {
        id: controlId,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(error ? { "aria-invalid": true, invalid: true } : {}),
      })
    : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={controlId} required={required}>
        {label}
      </Label>
      {control}
      {hint ? (
        <p id={hintId} className="text-sm text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
