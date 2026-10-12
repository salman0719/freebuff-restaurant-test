import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-700",
  secondary:
    "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200",
  outline:
    "border border-zinc-300 bg-transparent text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800",
  ghost: "bg-transparent text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Reusable class builder so links can share button styling. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonClassOptions = {}): string {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors",
    "focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-zinc-950",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && "w-full",
    className
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner and disables the button. Accessible name stays intact. */
  loading?: boolean;
}

function ButtonSpinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="animate-spin">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M15 8a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? <ButtonSpinner /> : null}
      {children}
    </button>
  );
}
