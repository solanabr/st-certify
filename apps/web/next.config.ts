import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],
  turbopack: {
    // Pin the monorepo root explicitly — Turbopack otherwise scans upward
    // and can land on an unrelated lockfile outside this repo.
    root: path.join(import.meta.dirname, "..", ".."),
  },
};

export default nextConfig;
