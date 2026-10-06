import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The kitchen-sink page (`*.dev.tsx`) is built only when KITCHEN_SINK=1, so it never ships.
  pageExtensions:
    process.env.KITCHEN_SINK === "1"
      ? ["tsx", "ts", "jsx", "js", "dev.tsx"]
      : ["tsx", "ts", "jsx", "js"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
