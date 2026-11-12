import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { embeddedBuildMeta } from "./scripts/embed-build-meta.ts";
import { securityHeaders } from "./src/lib/csp.ts";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The kitchen-sink page (`*.dev.tsx`) is built only when KITCHEN_SINK=1, so it never ships.
  pageExtensions:
    process.env.KITCHEN_SINK === "1"
      ? ["tsx", "ts", "jsx", "js", "dev.tsx"]
      : ["tsx", "ts", "jsx", "js"],
  turbopack: { root: process.cwd() },
  // Baseline security headers, in production builds only (src/lib/csp.ts).
  headers: async () => securityHeaders(process.env.NODE_ENV),
  // The deploy's build metadata (public/build-meta.json, written by npm run build:meta), read once
  // while the build loads this config and written into the build output, so the Live test page's
  // ISR regenerations never read a file at run time. "null" for a build with no file and no deploy
  // signal; a deploy build without a valid file fails here (scripts/embed-build-meta.ts).
  env: { BUILD_META_JSON: embeddedBuildMeta(process.env, readFileSync) },
};

export default nextConfig;
