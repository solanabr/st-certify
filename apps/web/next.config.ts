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

const isProd = process.env.NODE_ENV === "production";

/**
 * Scheme+host of a configured URL, dropping path and query — RPC providers
 * (Helius, QuickNode) carry the API key in the query string, and a CSP header
 * is public. Returns [] for unset/unparseable values so the directive simply
 * omits the origin instead of emitting a literal "undefined".
 */
function originOf(url: string | undefined): string[] {
  if (!url) return [];
  try {
    return [new URL(url).origin];
  } catch {
    return [];
  }
}

// Origins this app genuinely talks to, resolved from the same env the runtime
// reads (loadEnvConfig above already populated process.env).
const rpcOrigins = [
  ...originOf(process.env.NEXT_PUBLIC_RPC_URL),
  ...originOf(process.env.NEXT_PUBLIC_WS_URL),
];
const supabaseOrigins = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
// Supabase Realtime uses the same host over wss.
const supabaseWs = supabaseOrigins.map((o) => o.replace(/^https:/, "wss:"));

// Privy's published CSP allowlist, verified against
// https://docs.privy.io/security/implementation-guide/content-security-policy
// (their own example ships `frame-ancestors 'none'` — Privy never frames us,
// we frame it, so X-Frame-Options below is not in conflict).
const PRIVY_FRAME = [
  "https://auth.privy.io",
  "https://verify.walletconnect.com",
  "https://verify.walletconnect.org",
  "https://challenges.cloudflare.com",
];
const PRIVY_CONNECT = [
  "https://auth.privy.io",
  "https://*.privy.io",
  "https://*.rpc.privy.systems",
  "https://explorer-api.walletconnect.com",
  "wss://relay.walletconnect.com",
  "wss://relay.walletconnect.org",
  "wss://www.walletlink.org",
];

/**
 * Report-Only as of 2026-08-20, deliberately: this policy has never run
 * against real traffic, and an over-tight enforcing CSP breaks login (Privy)
 * or every chain read (RPC) with no way to recover client-side. Ship it,
 * watch the violation reports for the origins we guessed wrong — wallet
 * extensions injecting into the page, a mainnet RPC cutover, Privy adding a
 * CDN — then promote the header name to `Content-Security-Policy`.
 *
 * `'unsafe-inline'` in script-src is load-bearing, not laziness: the App
 * Router streams RSC payloads through inline `self.__next_f.push(...)` tags
 * and next-themes writes an inline pre-hydration script. Removing it requires
 * per-request nonces, which needs middleware on every route.
 */
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' ${isProd ? "" : "'unsafe-eval' "}https://auth.privy.io https://challenges.cloudflare.com`,
  `style-src 'self' 'unsafe-inline'`,
  // https: — certificate PNGs, NFT art and Privy's wallet icons come from
  // origins we do not enumerate; images are the low-risk directive to widen.
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  [
    `connect-src 'self'`,
    ...rpcOrigins,
    ...supabaseOrigins,
    ...supabaseWs,
    ...PRIVY_CONNECT,
    // Turbopack HMR socket.
    ...(isProd ? [] : ["ws://localhost:*", "http://localhost:*"]),
  ].join(" "),
  `frame-src ${PRIVY_FRAME.join(" ")}`,
  `child-src ${PRIVY_FRAME.join(" ")}`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'self'`,
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing embeds this app, and frame-ancestors is not enforced while the
  // CSP above is Report-Only — so this is the header actually carrying
  // clickjacking protection today. Drop it if/when the CSP goes enforcing.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: csp },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],
  turbopack: {
    // Pin the monorepo root explicitly — Turbopack otherwise scans upward
    // and can land on an unrelated lockfile outside this repo.
    root: path.join(import.meta.dirname, "..", ".."),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
