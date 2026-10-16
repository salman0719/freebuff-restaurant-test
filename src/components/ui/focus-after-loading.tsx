"use client";

import { useEffect, useRef, type ReactElement } from "react";

/**
 * Hands focus back to a button after its `loading` round trip ends.
 *
 * `loading` sets `disabled`, and a disabled element cannot hold focus: the
 * browser drops it to `<body>` the moment the spinner appears, and nothing
 * brings it back when the button re-enables. A keyboard user who saves a
 * form therefore finds their next Tab starting again at the very top of the
 * page — the 6.3 keyboard sweep found exactly that after a successful
 * profile save.
 *
 * It is a child of the button rather than hooks inside `Button` because
 * `Button` must stay server-renderable: `buttonClasses` is imported by
 * Server Components across the dashboard, operator and public pages, and
 * marking that module `"use client"` would drag the class helper across the
 * client boundary with it. A hidden, `aria-hidden` child adds nothing to
 * the accessible name, the layout, or the tab order.
 *
 * Focus is returned only when it went nowhere else: if the user tabbed
 * into the next field while the save ran, they keep it. In a browser that
 * means `activeElement` is still `<body>` — the tell that focus was lost
 * rather than moved.
 */
export function FocusAfterLoading({ loading }: { loading: boolean }): ReactElement {
  const guard = useRef<HTMLSpanElement>(null);
  const wasLoading = useRef(loading);

  useEffect(() => {
    const finished = wasLoading.current && !loading;
    wasLoading.current = loading;
    if (!finished) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    guard.current?.closest("button")?.focus();
  }, [loading]);

  return <span ref={guard} hidden aria-hidden="true" />;
}
