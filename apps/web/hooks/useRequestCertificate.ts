"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useStandardWallets } from "@privy-io/react-auth/solana";
import { api } from "@/lib/api-client";
import { fail } from "@/lib/errors";
import { isUserRejection } from "@/lib/chain/errors";
import { prepareRequestCertificateTransaction } from "@/lib/chain";
import { bytesToBase64, hexToBytes } from "@/lib/bytes";
import { useT, type TranslationKey } from "@/lib/i18n";

/** Truthful staged pending labels (appendix §2 request-form island spec). */
export type RequestStage = "idle" | "preparing" | "signing" | "confirming";

export const REQUEST_STAGE_LABEL: Record<RequestStage, TranslationKey> = {
  idle: "student.requestCertificate",
  preparing: "student.stage.preparing",
  signing: "student.stage.signing",
  confirming: "claim.confirming",
};

export interface RequestCertificateInput {
  editionAddress: string;
  name: string;
  consent: true;
  studentWallet: string;
}

interface PrepareResponse {
  certificateAddress: string;
  nameCommitmentHex: string;
}

export interface SubmitResponse {
  signature: string;
  alreadyProcessed: boolean;
}

/**
 * The full request-certificate write path (webapp-architecture: one write
 * mechanism, client-initiated since Privy holds the key in the browser):
 * server sanitizes + commits the name -> client builds the unsigned tx ->
 * Privy's wallet-standard `signTransaction` feature (spike-B's verified
 * integration path — signs raw compiled bytes, not through kit's own signer
 * machinery) -> POST /api/tx/submit (the single choke point).
 */
export function useRequestCertificate(): UseMutationResult<
  SubmitResponse,
  Error,
  RequestCertificateInput
> & { stage: RequestStage } {
  const { wallets } = useStandardWallets();
  const queryClient = useQueryClient();
  const { t } = useT();
  const [stage, setStage] = useState<RequestStage>("idle");

  const mutation = useMutation({
    mutationFn: async (
      input: RequestCertificateInput,
    ): Promise<SubmitResponse> => {
      setStage("preparing");
      const prepared = await api<PrepareResponse>(
        "/api/certificates/prepare-request",
        { json: input },
      );

      const wallet = wallets.find((w) =>
        w.accounts.some((a) => a.address === input.studentWallet),
      );
      const account = wallet?.accounts.find(
        (a) => a.address === input.studentWallet,
      );
      if (!wallet || !account) {
        fail("UNAUTHORIZED", t("student.walletNotFound"));
      }

      const signFeature = wallet.features["solana:signTransaction"];
      if (!signFeature) {
        fail("INTERNAL", t("student.walletNoSign"));
      }

      const tx = await prepareRequestCertificateTransaction({
        student: input.studentWallet,
        edition: input.editionAddress,
        nameCommitment: hexToBytes(prepared.nameCommitmentHex),
      });

      setStage("signing");
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
          fail("CHAIN_REJECTED_BY_USER", t("student.signatureCancelled"));
        }
        throw err;
      }

      setStage("confirming");
      return api<SubmitResponse>("/api/tx/submit", {
        json: {
          wireBytesBase64: bytesToBase64(signedBytes),
          lastValidBlockHeight: tx.lastValidBlockHeight.toString(),
          kind: "request_certificate",
          certificateAddress: prepared.certificateAddress,
        },
      });
    },
    onSuccess: () => {
      setStage("idle");
      void queryClient.invalidateQueries({ queryKey: ["me", "certificates"] });
    },
    onError: () => setStage("idle"),
  });

  return { ...mutation, stage };
}
