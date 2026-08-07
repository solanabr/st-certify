"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStandardWallets } from "@privy-io/react-auth/solana";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { onAppError } from "@/lib/on-app-error";
import { bytesToBase64 } from "@/lib/bytes";
import {
  buildSignBatchTxs,
  type SignBatchGroup,
} from "@/lib/chain/certificator";

/** Per-cert lifecycle within a batch run — drives row badges (status = text+shape, never color alone). */
export type CertSignState = "idle" | "signing" | "confirmed" | "failed";

export interface MassSignProgress {
  running: boolean;
  totalCerts: number;
  totalChunks: number;
  confirmedChunks: number;
  /** cert address -> its state in the current/last run. */
  certState: Record<string, CertSignState>;
}

export interface MassSignInput {
  signerWallet: string;
  groups: SignBatchGroup[];
}

const IDLE: MassSignProgress = {
  running: false,
  totalCerts: 0,
  totalChunks: 0,
  confirmedChunks: 0,
  certState: {},
};

function isUserRejection(err: unknown): boolean {
  const m = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    m.includes("reject") ||
    m.includes("declin") ||
    m.includes("cancel") ||
    m.includes("closed")
  );
}

function withState(
  prev: Record<string, CertSignState>,
  addrs: string[],
  state: CertSignState,
): Record<string, CertSignState> {
  const next = { ...prev };
  for (const a of addrs) next[a] = state;
  return next;
}

/**
 * The mass-sign flow (plan §"Mass sign" + appendix §2): build one
 * `sign_certificate` ix per selected cert, chunk 20/tx per edition off ONE
 * blockhash, sign ALL chunks in a single wallet-standard round trip (one Phantom
 * popup / silent embedded — spike-B's verified variadic path), then submit each
 * chunk serially with truthful per-chunk progress (invalidate + refetch per
 * confirmed chunk — never a client counter). One summary toast; failed chunks
 * get row error badges. Retrying = re-selecting the still-pending rows from the
 * refetched inbox (resume = requery; program re-sign is a no-op so overlaps are
 * safe; rejected/closed certs have already vanished from the query).
 */
export function useMassSign(): {
  run: (input: MassSignInput) => Promise<void>;
  progress: MassSignProgress;
  reset: () => void;
} {
  const { wallets } = useStandardWallets();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<MassSignProgress>(IDLE);

  const reset = useCallback(() => setProgress(IDLE), []);

  const run = useCallback(
    async (input: MassSignInput): Promise<void> => {
      const allCerts = input.groups.flatMap((g) => g.certificateAddresses);
      if (allCerts.length === 0) return;

      const wallet = wallets.find((w) =>
        w.accounts.some((a) => a.address === input.signerWallet),
      );
      const account = wallet?.accounts.find(
        (a) => a.address === input.signerWallet,
      );
      const signFeature = wallet?.features["solana:signTransaction"];
      if (!wallet || !account || !signFeature) {
        toast.error("Carteira não encontrada. Reconecte e tente novamente.");
        return;
      }

      setProgress({
        running: true,
        totalCerts: allCerts.length,
        totalChunks: 0,
        confirmedChunks: 0,
        certState: withState({}, allCerts, "idle"),
      });

      let plans;
      try {
        plans = await buildSignBatchTxs({
          signer: input.signerWallet,
          groups: input.groups,
        });
      } catch (err) {
        onAppError(err);
        setProgress(IDLE);
        return;
      }

      setProgress((p) => ({
        ...p,
        totalChunks: plans.length,
        certState: withState(p.certState, allCerts, "signing"),
      }));

      // ONE variadic sign call for every chunk — one wallet round trip.
      let signed: readonly { signedTransaction: Uint8Array }[];
      try {
        signed = await signFeature.signTransaction(
          ...plans.map((plan) => ({
            account,
            transaction: plan.wireBytes,
            chain: "solana:devnet" as const,
          })),
        );
      } catch (err) {
        if (isUserRejection(err)) toast("Assinatura cancelada.");
        else onAppError(err);
        setProgress(IDLE);
        return;
      }

      // Serial submit, truthful per-chunk progress (refetch as each confirms).
      let signedCount = 0;
      let failedCount = 0;
      for (let i = 0; i < plans.length; i++) {
        const plan = plans[i];
        try {
          await api("/api/certificator/submit", {
            json: {
              wireBytesBase64: bytesToBase64(signed[i].signedTransaction),
              lastValidBlockHeight: plan.lastValidBlockHeight.toString(),
              certificateAddresses: plan.certificateAddresses,
              editionAddress: plan.editionAddress,
            },
          });
          signedCount += plan.certificateAddresses.length;
          setProgress((p) => ({
            ...p,
            confirmedChunks: p.confirmedChunks + 1,
            certState: withState(
              p.certState,
              plan.certificateAddresses,
              "confirmed",
            ),
          }));
          void queryClient.invalidateQueries({
            queryKey: ["certificator", "pending"],
          });
        } catch {
          failedCount += plan.certificateAddresses.length;
          setProgress((p) => ({
            ...p,
            certState: withState(
              p.certState,
              plan.certificateAddresses,
              "failed",
            ),
          }));
        }
      }

      setProgress((p) => ({ ...p, running: false }));
      if (failedCount === 0) {
        toast.success(`${signedCount} assinados`);
      } else {
        toast.message(`${signedCount} assinados · ${failedCount} falharam`, {
          description: "Selecione as linhas com erro e tente novamente.",
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["certificator", "pending"],
      });
    },
    [wallets, queryClient],
  );

  return { run, progress, reset };
}
