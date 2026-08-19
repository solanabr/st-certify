"use client";

import type { Wallet, WalletAccount } from "@wallet-standard/base";

export type WalletHandle = Wallet;
export type WalletAccountHandle = WalletAccount;

// Minimal local shapes of the two wallet-standard features we call —
// identical to how hooks/useClaim.ts drives "solana:signTransaction".
interface StandardConnectFeature {
  connect(input?: {
    silent?: boolean;
  }): Promise<{ accounts: readonly WalletAccount[] }>;
}
interface SolanaSignMessageFeature {
  signMessage(
    ...inputs: { account: WalletAccount; message: Uint8Array }[]
  ): Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array }[]>;
}

export function getSolanaSignerWallets(wallets: readonly Wallet[]): Wallet[] {
  return wallets.filter(
    (w) =>
      "standard:connect" in w.features &&
      "solana:signMessage" in w.features &&
      w.chains.some((c) => c.startsWith("solana:")),
  );
}

export async function connectWallet(
  wallet: Wallet,
): Promise<readonly WalletAccount[]> {
  const feature = wallet.features["standard:connect"] as StandardConnectFeature;
  const { accounts } = await feature.connect();
  return accounts;
}

export async function signMessageWith(
  wallet: Wallet,
  account: WalletAccount,
  message: Uint8Array,
): Promise<Uint8Array> {
  const feature = wallet.features[
    "solana:signMessage"
  ] as SolanaSignMessageFeature;
  const [result] = await feature.signMessage({ account, message });
  // Invariant guard, not user-facing copy: this Error's .message never
  // reaches the UI directly — toAppError() maps any thrown Error to its
  // generic pt-BR message before a toast renders it.
  if (!result) throw new Error("wallet returned an empty signature");
  return result.signature;
}
