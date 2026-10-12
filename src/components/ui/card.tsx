import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** Surface container for grouped content. */
export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900",
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
    <h3
      className={cn("text-base font-semibold text-zinc-900 dark:text-zinc-50", className)}
      {...rest}
    >
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
