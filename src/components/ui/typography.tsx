import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type HeadingLevel = 1 | 2 | 3 | 4;

const headingSizes: Record<HeadingLevel, string> = {
  1: "text-3xl font-semibold tracking-tight sm:text-4xl",
  2: "text-2xl font-semibold tracking-tight sm:text-3xl",
  3: "text-xl font-semibold tracking-tight",
  4: "text-lg font-semibold tracking-tight",
};

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: HeadingLevel;
}

/** Semantic heading (h1–h4) with responsive scale. */
export function Heading({ level = 2, className, ...rest }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      className={cn(headingSizes[level], "text-zinc-900 dark:text-zinc-50", className)}
      {...rest}
    />
  );
}

export type TextSize = "sm" | "md" | "lg";

const textSizes: Record<TextSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

export interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  size?: TextSize;
  muted?: boolean;
}

/** Body copy with an optional muted tone. */
export function Text({ size = "md", muted = false, className, ...rest }: TextProps) {
  return (
    <p
      className={cn(
        textSizes[size],
        "leading-7",
        muted ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-700 dark:text-zinc-200",
        className
      )}
      {...rest}
    />
  );
}

export type EyebrowProps = HTMLAttributes<HTMLParagraphElement>;

/** Small uppercase kicker shown above headings. */
export function Eyebrow({ className, ...rest }: EyebrowProps) {
  return (
    <p
      className={cn(
        "text-xs font-semibold tracking-widest text-brand-700 uppercase dark:text-brand-100",
        className
      )}
      {...rest}
    />
  );
}
