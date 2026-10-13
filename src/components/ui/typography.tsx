import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type HeadingLevel = 1 | 2 | 3 | 4;

const headingSizes: Record<HeadingLevel, string> = {
  1: "font-display text-4xl font-semibold tracking-tight sm:text-5xl",
  2: "font-display text-2xl font-semibold tracking-tight sm:text-3xl",
  3: "text-xl font-semibold tracking-tight",
  4: "text-lg font-semibold tracking-tight",
};

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: HeadingLevel;
}

/** Semantic heading (h1–h4); levels 1–2 use the editorial display serif. */
export function Heading({ level = 2, className, ...rest }: HeadingProps) {
  const Tag = `h${level}` as const;
  return <Tag className={cn(headingSizes[level], "text-foreground", className)} {...rest} />;
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
        muted ? "text-muted-foreground" : "text-foreground/80",
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
        "text-xs font-semibold tracking-[0.2em] text-brand-700 uppercase dark:text-brand-300",
        className
      )}
      {...rest}
    />
  );
}
