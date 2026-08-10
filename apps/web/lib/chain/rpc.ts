import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import { fail } from "@/lib/errors";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

export const rpcConfigured = Boolean(RPC_URL && WS_URL);

let rpcSingleton: Rpc<SolanaRpcApi> | null = null;
let rpcSubscriptionsSingleton: RpcSubscriptions<SolanaRpcSubscriptionsApi> | null =
  null;

/** Shared kit RPC client for devnet, built from NEXT_PUBLIC_RPC_URL. */
export function getRpc(): Rpc<SolanaRpcApi> {
  if (!RPC_URL) {
    fail("INTERNAL", "NEXT_PUBLIC_RPC_URL não configurado.");
  }
  rpcSingleton ??= createSolanaRpc(RPC_URL);
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
