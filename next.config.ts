import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { embeddedBuildMeta } from "./scripts/embed-build-meta.ts";
import { cvPdfEnv } from "./src/lib/cv-pdf-file.ts";
import { securityHeaders } from "./src/lib/csp.ts";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The kitchen-sink page (`*.dev.tsx`) is built only when KITCHEN_SINK=1, so it never ships.
  pageExtensions:
    process.env.KITCHEN_SINK === "1"
      ? ["tsx", "ts", "jsx", "js", "dev.tsx"]
      : ["tsx", "ts", "jsx", "js"],
  turbopack: { root: process.cwd() },
  // The About photograph renders at 480 px wide and 960 px on dense screens (content/about-photo.ts);
  // those are the only widths the optimiser serves, as AVIF where the browser takes it.
  images: { deviceSizes: [480, 960], imageSizes: [], formats: ["image/avif"], qualities: [75] },
  // Baseline security headers, in production builds only (src/lib/csp.ts).
  headers: async () => securityHeaders(process.env.NODE_ENV),
  // The deploy's build metadata (public/build-meta.json, written by npm run build:meta), read once
  // while the build loads this config and written into the build output, so the Live test page's
  // ISR regenerations never read a file at run time. "null" for a build with no file and no deploy
  // signal; a deploy build without a valid file fails here (scripts/embed-build-meta.ts).
  // The CV PDF this build links, read once here so every page agrees (src/lib/cv-pdf.ts): the
  // checked PDF's metadata as JSON, or an empty string when there is no PDF with matching metadata.
  env: { BUILD_META_JSON: embeddedBuildMeta(process.env, readFileSync), CV_PDF: cvPdfEnv(process.cwd()) },
};

export default nextConfig;
