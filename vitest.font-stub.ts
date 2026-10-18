/**
 * Vitest stand-in for `next/font/google`, the same way Next.js's own docs
 * wire one up for Jest: the real module is rewritten by Next's compiler,
 * so its named exports are not callable under plain Vite/Vitest and any
 * component that registers a font fails at import time.
 *
 * Returns the shape the app reads off a font — a className, the CSS
 * variable hook, and a style object — so theme wrappers keep rendering in
 * unit tests. The alias lives in `vitest.config.ts`.
 */
function fontStub() {
  return {
    className: "",
    variable: "",
    style: { fontFamily: "", weight: "", style: "" as const },
  };
}

export const Caprasimo = fontStub;
export const Fraunces = fontStub;
export const Geist = fontStub;
export const Geist_Mono = fontStub;
