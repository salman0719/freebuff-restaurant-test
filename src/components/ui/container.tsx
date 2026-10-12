import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type ContainerProps = HTMLAttributes<HTMLDivElement>;

/** Centered max-width page container with mobile-first gutters. */
export function Container({ className, children, ...rest }: ContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...rest}>
      {children}
    </div>
  );
}

export type SectionProps = HTMLAttributes<HTMLElement>;

/** Vertical page section with responsive rhythm. */
export function Section({ className, children, ...rest }: SectionProps) {
  return (
    <section className={cn("py-8 sm:py-12", className)} {...rest}>
      {children}
    </section>
  );
}

export type StackProps = HTMLAttributes<HTMLDivElement>;

/** Vertical stack with consistent spacing. */
export function Stack({ className, children, ...rest }: StackProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)} {...rest}>
      {children}
    </div>
  );
}
