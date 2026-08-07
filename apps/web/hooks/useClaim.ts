"use client";

import { useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useStandardWallets } from "@privy-io/react-auth/solana";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { fail, toAppError } from "@/lib/errors";
import { isUserRejection } from "@/lib/chain/errors";
import { onAppError } from "@/lib/on-app-error";
import { base64ToBytes, bytesToBase64 } from "@/lib/bytes";

/** Claim stepper stages (appendix §M5 delta). "minting"/done are shown by the card's Claimed state (chain-truthful). */
export type ClaimStage = "idle" | "rendering" | "signing" | "confirming";

interface PrepareClaimResponse {
  wireTxBase64: string;
  lastValidBlockHeight: string;
  studentWallet: string;
  imageUrl: string;
  hash: string;
}

interface SubmitClaimResponse {
  status: "claimed";
  certNumber: number;
  asset: string | null;
  imageUrl: string | null;
}

export interface ClaimInput {
  certificateAddress: string;
}

/**
 * The claim write path: render + notary co-sign server-side (POST claim) → the
 * student completes the co-signature via the wallet-standard feature → confirm +
 * mint + record (POST claim-submit, idempotent). On a blockhash expiry the whole
 * prepare→sign→submit is retried ONCE silently (fresh blockhash + notary sig;
 * the render is deterministic so the hash is unchanged); the mint's
 * "Emitindo NFT" + done reveal are the card's own chain-driven Claimed states.
 */
export function useClaim(): UseMutationResult<
  SubmitClaimResponse,
  Error,
  ClaimInput
> & { stage: ClaimStage } {
  const { wallets } = useStandardWallets();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<ClaimStage>("idle");
  // The cert's student wallet (fee payer) — targets the airdrop CTA on insufficient funds.
  const studentWalletRef = useRef<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: async (input: ClaimInput): Promise<SubmitClaimResponse> => {
      const attempt = async (): Promise<SubmitClaimResponse> => {
        setStage("rendering");
        const prepared = await api<PrepareClaimResponse>(
          `/api/certificates/${input.certificateAddress}/claim`,
          { method: "POST" },
        );
        studentWalletRef.current = prepared.studentWallet;

        const wallet = wallets.find((w) =>
          w.accounts.some((a) => a.address === prepared.studentWallet),
        );
        const account = wallet?.accounts.find(
          (a) => a.address === prepared.studentWallet,
        );
        const signFeature = wallet?.features["solana:signTransaction"];
        if (!wallet || !account || !signFeature) {
          fail(
            "UNAUTHORIZED",
            "Carteira do certificado não encontrada. Reconecte e tente novamente.",
          );
        }

        setStage("signing");
        let signedBytes: Uint8Array;
        try {
          const [signed] = await signFeature.signTransaction({
            account,
            transaction: base64ToBytes(prepared.wireTxBase64),
            chain: "solana:devnet",
          });
          signedBytes = signed.signedTransaction;
        } catch (err) {
          if (isUserRejection(err)) {
            fail("CHAIN_REJECTED_BY_USER", "Assinatura cancelada.");
          }
          throw err;
        }

        setStage("confirming");
        return api<SubmitClaimResponse>(
          `/api/certificates/${input.certificateAddress}/claim-submit`,
          {
            json: {
              wireBytesBase64: bytesToBase64(signedBytes),
              lastValidBlockHeight: prepared.lastValidBlockHeight,
            },
          },
        );
      };

      try {
        return await attempt();
      } catch (err) {
        // One silent retry on a stale blockhash (re-render is deterministic).
        if (toAppError(err).code === "CHAIN_BLOCKHASH_EXPIRED") {
          return attempt();
        }
        throw err;
      }
    },
    onSuccess: () => {
      setStage("idle");
      toast.success("Certificado resgatado");
      void queryClient.invalidateQueries({ queryKey: ["me", "certificates"] });
    },
    onError: (err) => {
      setStage("idle");
      onAppError(err, undefined, { airdropWallet: studentWalletRef.current });
    },
  });

  return { ...mutation, stage };
}
