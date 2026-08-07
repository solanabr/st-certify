// Client-safe entry point for on-chain helpers. Server-only signer loading
// lives in `@/lib/chain/server` (imports `node:fs`, must never reach the
// client bundle) — import that explicitly where needed.
export { getRpc, getRpcSubscriptions, rpcConfigured } from "./rpc";
