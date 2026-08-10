import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// This is a pnpm workspace monorepo — the real .env lives at the repo root
// (secrets shared across apps/web, programs/, packages/, scripts/), not in
// apps/web/ itself. Next's own env loading (@next/env under the hood) only
// looks in its CWD by default, so without this, every env-dependent feature
// (Privy, RPC endpoints, program id, admin allowlists, notary/operator
// keys) silently reads as unconfigured — confirmed live: the landing page
// rendered "NEXT_PUBLIC_PRIVY_APP_ID não está configurado" despite a real
// value being set in the root .env. loadEnvConfig is the exact function
// Next's CLI calls internally for its own .env loading; this just points it
// at the monorepo root instead, before anything else in the app reads
// process.env. Same repo root path as the turbopack.root pin below.
const workspaceRoot = path.join(import.meta.dirname, "..", "..");
loadEnvConfig(workspaceRoot, process.env.NODE_ENV !== "production");

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],
  turbopack: {
    // Pin the monorepo root explicitly — Turbopack otherwise scans upward
    // and can land on an unrelated lockfile outside this repo.
    root: path.join(import.meta.dirname, "..", ".."),
  },
};

export default nextConfig;
