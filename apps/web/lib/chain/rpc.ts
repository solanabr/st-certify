import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import { fail } from "@/lib/errors";

// NOT `server-only`, deliberately: app/providers.tsx, hooks/useWalletBalance,
// hooks/useRequestCertificate and components/verify/** all reach this module
// from the browser (see lib/chain/index.ts — "client-safe entry point"), so
// marking it server-only breaks the client build. HELIUS_API_KEY is instead
// fenced by the `typeof window` guard in resolveRpcUrl; keep it that way.

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

export const rpcConfigured = Boolean(RPC_URL && WS_URL);

let rpcSingleton: Rpc<SolanaRpcApi> | null = null;
let rpcSubscriptionsSingleton: RpcSubscriptions<SolanaRpcSubscriptionsApi> | null =
  null;

/**
 * Endpoint every server-side RPC connection should be built from: a Helius URL
 * when HELIUS_API_KEY is set, else NEXT_PUBLIC_RPC_URL. Cluster follows the
 * public URL so a mainnet cutover needs no extra config. In the browser the key
 * is never read (and Next never inlines it), so callers there keep the public
 * endpoint.
 */
export function resolveRpcUrl(): string {
  const heliusKey =
    typeof window === "undefined" ? process.env.HELIUS_API_KEY : undefined;
  const publicUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "";
  if (!heliusKey) return publicUrl;

  const cluster =
    publicUrl === "" || publicUrl.includes("devnet") ? "devnet" : "mainnet";
  return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
}

/** Shared kit RPC client, built from resolveRpcUrl (Helius when available). */
export function getRpc(): Rpc<SolanaRpcApi> {
  const url = resolveRpcUrl();
  if (!url) {
    fail("INTERNAL", "NEXT_PUBLIC_RPC_URL não configurado.");
  }
  rpcSingleton ??= createSolanaRpc(url);
  return rpcSingleton;
}

/** Shared kit RPC subscriptions client, built from NEXT_PUBLIC_WS_URL. */
export function getRpcSubscriptions(): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
  if (!WS_URL) {
    fail("INTERNAL", "NEXT_PUBLIC_WS_URL não configurado.");
  }
  rpcSubscriptionsSingleton ??= createSolanaRpcSubscriptions(WS_URL);
  return rpcSubscriptionsSingleton;
}
