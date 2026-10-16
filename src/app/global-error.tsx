/**
 * Root error boundary (Phase 6.2). Last resort: catches failures that
 * escape every nested boundary, including the public restaurant page when
 * the database is unreachable.
 *
 * Self-contained by necessity — it replaces the root layout, so it owns
 * its own `<html>`/`<body>` and uses inline styles rather than the theme.
 * Copy stays generic on purpose: a visitor learns "try again", never what
 * broke. The `digest` is shown so a report can be matched to the
 * server-side log, where the actionable detail lives (redacted).
 */
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafaf9",
          color: "#1c1917",
          padding: "1rem",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Something went wrong
          </p>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>
            This page could not be loaded
          </h1>
          <p style={{ color: "#57534e", margin: "0 0 1.5rem" }}>
            Nothing was changed on your account. Please try again shortly.
            {error.digest ? ` (Reference: ${error.digest})` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #d6d3d1",
              background: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
