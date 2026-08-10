"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useStandardWallets } from "@privy-io/react-auth/solana";
import { api } from "@/lib/api-client";
import { fail } from "@/lib/errors";
import { isUserRejection } from "@/lib/chain/errors";
import { buildRejectTx } from "@/lib/chain/certificator";
import { bytesToBase64 } from "@/lib/bytes";

export interface RejectInput {
  certificateAddress: string;
  editionAddress: string;
  /** cert.student == owner_wallet — the address-targeted refund recipient. */
  studentRefund: string;
  reason?: string;
  /** The certifier's wallet (an edition signer signs their own reject). */
  signerWallet: string;
}

interface SubmitResponse {
  signature: string;
  alreadyProcessed: boolean;
}

/**
 * Reject (merged reject+close) a single request. The certifier signs their own
 * reject tx client-side (wallet-standard); the route submits it + flips the
 * mirror to Rejected. Refund is address-targeted to the student on-chain.
 */
export function useReject(): UseMutationResult<
  SubmitResponse,
  Error,
  RejectInput
> {
  const { wallets } = useStandardWallets();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RejectInput): Promise<SubmitResponse> => {
      const wallet = wallets.find((w) =>
        w.accounts.some((a) => a.address === input.signerWallet),
      );
      const account = wallet?.accounts.find(
        (a) => a.address === input.signerWallet,
      );
      if (!wallet || !account) {
        fail(
          "UNAUTHORIZED",
          "Carteira não encontrada. Reconecte e tente novamente.",
        );
      }
      const signFeature = wallet.features["solana:signTransaction"];
      if (!signFeature) {
        fail("INTERNAL", "Esta carteira não suporta assinatura de transações.");
      }

      const tx = await buildRejectTx({
        authority: input.signerWallet,
        edition: input.editionAddress,
        certificate: input.certificateAddress,
        studentRefund: input.studentRefund,
      });

      let signedBytes: Uint8Array;
      try {
        const [signed] = await signFeature.signTransaction({
          account,
          transaction: tx.wireBytes,
          chain: "solana:devnet",
        });
        signedBytes = signed.signedTransaction;
      } catch (err) {
        if (isUserRejection(err)) {
          fail("CHAIN_REJECTED_BY_USER", "Assinatura cancelada.");
        }
        throw err;
      }

      return api<SubmitResponse>("/api/certificator/reject", {
        json: {
          wireBytesBase64: bytesToBase64(signedBytes),
          lastValidBlockHeight: tx.lastValidBlockHeight.toString(),
          certificateAddress: input.certificateAddress,
          editionAddress: input.editionAddress,
          reason: input.reason,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["certificator", "pending"],
      });
    },
  });
}
