import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        // `next/font/google` is rewritten by Next's compiler, so under
        // Vitest its exports are not callable. Stub it — see the file.
        find: /^next\/font\/google$/,
        replacement: fileURLToPath(new URL("./vitest.font-stub.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
