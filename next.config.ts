import type { NextConfig } from "next";
import { APP_SECURITY_HEADERS } from "./src/lib/app-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * Baseline security headers on every response (Phase 6.1). The values and
   * the reasoning for each live in `./src/lib/app-headers.ts`, where they are
   * unit-tested; this is only the wiring. Verified against a production
   * server rather than assumed — a config that type-checks proves nothing
   * about what a real response carries.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: APP_SECURITY_HEADERS.map((header) => ({ key: header.key, value: header.value })),
      },
    ];
  },
};

export default nextConfig;
