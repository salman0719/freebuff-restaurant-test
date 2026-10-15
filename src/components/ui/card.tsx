import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a subtle hover lift for cards that act as links. */
  interactive?: boolean;
}

/** Surface container for grouped content. */
export function Card({ interactive = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6",
        interactive && "transition-shadow duration-200 hover:shadow-md",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement>;

/** Card heading (h3). */
export function CardTitle({ className, children, ...rest }: CardTitleProps) {
  return (
    <h3 className={cn("text-base font-semibold text-foreground", className)} {...rest}>
      {children}
    </h3>
  );
}

export type CardContentProps = HTMLAttributes<HTMLDivElement>;

/** Card body with relaxed spacing for grouped rows. */
export function CardContent({ className, children, ...rest }: CardContentProps) {
  return (
    <div className={cn("mt-2 flex flex-col gap-3", className)} {...rest}>
      {children}
    </div>
  );
}
