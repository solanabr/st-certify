// Client-safe (only reads NEXT_PUBLIC_RPC_URL) — deliberately NOT server-only,
// unlike the rest of lib/chain. Derives the explorer cluster suffix from the
// configured RPC so a mainnet cutover needs zero component edits.

const EXPLORER_BASE = "https://explorer.solana.com";

function clusterSuffix(): string {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "";
  if (rpc.includes("devnet")) return "?cluster=devnet";
  if (rpc.includes("testnet")) return "?cluster=testnet";
  return "";
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_BASE}/address/${address}${clusterSuffix()}`;
}

export function explorerTxUrl(signature: string): string {
  return `${EXPLORER_BASE}/tx/${signature}${clusterSuffix()}`;
}

export function explorerBaseUrl(): string {
  return `${EXPLORER_BASE}${clusterSuffix()}`;
}
