import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
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
 * Which child is the control? A field may hold more than its input — the
 * current-photo preview above it, a "remove photo" checkbox's own label
 * below it — and the label, hint and error all belong to the *input*, not
 * to that decoration. A lone child stays the control exactly as before;
 * among several it is the one carrying a `name`, because a control
 * without a name never submits and decoration never has one.
 *
 * Returns -1 when no child looks like a control, which leaves the field
 * un-wired rather than wiring a decorative element by accident — the
 * behaviour a multi-child field had before, minus the lie to screen
 * readers that a `for` attribute pointing nowhere is.
 */
function findControlIndex(nodes: ReactNode[]): number {
  if (nodes.length === 1) return 0;
  return nodes.findIndex(
    (node) => isValidElement<{ name?: unknown }>(node) && typeof node.props.name === "string"
  );
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

  const injected: InjectedControlProps = {
    id: controlId,
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(error ? { "aria-invalid": true, invalid: true } : {}),
  };
  const nodes = Children.toArray(children);
  const index = findControlIndex(nodes);
  const control =
    index === -1
      ? children
      : Children.map(nodes, (node, position) =>
          position === index && isValidElement(node)
            ? cloneElement(node as ReactElement<InjectedControlProps>, injected)
            : node
        );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={controlId} required={required}>
        {label}
      </Label>
      {control}
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
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
