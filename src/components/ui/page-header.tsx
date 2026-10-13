import type { ReactNode } from "react";
import { cn } from "./cn";
import { Eyebrow, Heading, Text } from "./typography";

export interface PageHeaderProps {
  /** Optional small kicker above the title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Optional supporting copy beneath the title. */
  description?: ReactNode;
  /** Slot: trailing actions (buttons, links). */
  actions?: ReactNode;
  className?: string;
}

/** Consistent page intro: kicker, title, description, and actions. */
export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading level={1}>{title}</Heading>
        {description ? <Text muted>{description}</Text> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
