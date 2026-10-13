"use client";

/**
 * Theme provider (Phase A). Wraps next-themes so the app supports an explicit
 * light/dark choice while still defaulting to the system preference. Toggling
 * flips the `dark` class on <html>, which the `dark:` variant in `globals.css`
 * keys off.
 */
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
