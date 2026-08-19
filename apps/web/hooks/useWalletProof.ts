"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "@/lib/api-client";
import { fail } from "@/lib/errors";
import { isUserRejection } from "@/lib/chain/errors";
import { bytesToBase64 } from "@/lib/bytes";
import { useMe } from "@/hooks/useMe";
import { useT } from "@/lib/i18n";
import {
  connectWallet,
  getSolanaSignerWallets,
  signMessageWith,
  useRegistryWallets,
  type WalletAccountHandle,
  type WalletHandle,
} from "@/lib/wallet";

export interface ProofPayload {
  wallet: string;
  message?: string;
  signatureBase64?: string;
}

export function useWalletProof() {
  const registry = useRegistryWallets();
  const wallets = getSolanaSignerWallets(registry);
  const { data: me } = useMe();
  const { login } = usePrivy();
  const { t } = useT();
  const [selected, setSelected] = useState<{
    wallet: WalletHandle;
    account: WalletAccountHandle;
  } | null>(null);

  const connect = useCallback(
    async (wallet: WalletHandle) => {
      const accounts = await connectWallet(wallet);
      const account = accounts[0];
      if (!account) {
        fail("UNAUTHORIZED", t("attendance.walletNoAccount"));
      }
      setSelected({ wallet, account });
    },
    [t],
  );

  const prove = useCallback(
    async (
      purpose: "attendance-claim" | "attendance-creator",
    ): Promise<ProofPayload> => {
      if (!selected) fail("UNAUTHORIZED", t("attendance.walletNotConnected"));
      const address = selected.account.address;
      // Privy-session shortcut: the server verifies wallet linkage from the
      // identity-token cookie — no signature round-trip needed.
      if (me?.authenticated && me.wallets.includes(address)) {
        return { wallet: address };
      }
      const { message } = await api<{ message: string; nonce: string }>(
        "/api/attendance/auth/nonce",
        { json: { wallet: address, purpose } },
      );
      try {
        const signature = await signMessageWith(
          selected.wallet,
          selected.account,
          new TextEncoder().encode(message),
        );
        return {
          wallet: address,
          message,
          signatureBase64: bytesToBase64(signature),
        };
      } catch (err) {
        if (isUserRejection(err)) {
          fail("CHAIN_REJECTED_BY_USER", t("attendance.signatureCancelled"));
        }
        throw err;
      }
    },
    [selected, me, t],
  );

  return {
    wallets,
    selected,
    connect,
    disconnect: () => setSelected(null),
    prove,
    privyLogin: login,
  };
}
