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
 * blockhash, then sign per DISTINCT signer wallet — a certifier is usually
 * registered under the same wallet everywhere, so this is still one
 * wallet-standard round trip (one Phantom popup / silent embedded — spike-B's
 * verified variadic path) in the common case, but issues one variadic call per
 * wallet when a certifier's editions actually require different wallets (fix
 * round 1: previously every chunk was signed with only the FIRST selected
 * edition's wallet, producing on-chain NotASigner for the rest). Submit is
 * serial per chunk with truthful per-chunk progress (invalidate + refetch per
 * confirmed chunk — never a client counter). One summary toast; chunks that
 * fail at either the signing or submit stage get row error badges. Retrying =
 * re-selecting the still-pending rows from the refetched inbox (resume =
 * requery; program re-sign is a no-op so overlaps are safe; rejected/closed
 * certs have already vanished from the query).
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

      // Fail fast if any of the distinct wallets this batch needs isn't
      // connected — before any RPC round trip, same as the old single-wallet
      // check (most batches need exactly one wallet).
      const distinctWallets = [
        ...new Set(input.groups.map((g) => g.signerWallet)),
      ];
      for (const w of distinctWallets) {
        const wallet = wallets.find((x) =>
          x.accounts.some((a) => a.address === w),
        );
        const account = wallet?.accounts.find((a) => a.address === w);
        const signFeature = wallet?.features["solana:signTransaction"];
        if (!wallet || !account || !signFeature) {
          toast.error("Carteira não encontrada. Reconecte e tente novamente.");
          return;
        }
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
        plans = await buildSignBatchTxs({ groups: input.groups });
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

      // One variadic sign call PER DISTINCT signer wallet — one popup in the
      // common single-wallet case, N popups only when N wallets are actually
      // required. A wallet whose popup is cancelled/fails has its chunks
      // marked "failed" and excluded from submission; the other wallets'
      // chunks still proceed (partial-tolerant, same spirit as submit below).
      const plansByWallet = new Map<string, number[]>();
      plans.forEach((plan, i) => {
        const indices = plansByWallet.get(plan.signerWallet) ?? [];
        indices.push(i);
        plansByWallet.set(plan.signerWallet, indices);
      });

      const signedByIndex = new Map<number, Uint8Array>();
      for (const [walletAddress, indices] of plansByWallet) {
        const wallet = wallets.find((x) =>
          x.accounts.some((a) => a.address === walletAddress),
        );
        const account = wallet?.accounts.find(
          (a) => a.address === walletAddress,
        );
        const signFeature = wallet?.features["solana:signTransaction"];
        if (!wallet || !account || !signFeature) {
          // Validated above — stays defensive against a mid-flow disconnect.
          setProgress((p) => ({
            ...p,
            certState: withState(
              p.certState,
              indices.flatMap((i) => plans[i].certificateAddresses),
              "failed",
            ),
          }));
          continue;
        }
        try {
          const signed = await signFeature.signTransaction(
            ...indices.map((i) => ({
              account,
              transaction: plans[i].wireBytes,
              chain: "solana:devnet" as const,
            })),
          );
          indices.forEach((i, j) =>
            signedByIndex.set(i, signed[j].signedTransaction),
          );
        } catch (err) {
          if (isUserRejection(err)) toast("Assinatura cancelada.");
          else onAppError(err);
          setProgress((p) => ({
            ...p,
            certState: withState(
              p.certState,
              indices.flatMap((i) => plans[i].certificateAddresses),
              "failed",
            ),
          }));
        }
      }

      if (signedByIndex.size === 0) {
        setProgress(IDLE);
        return;
      }

      // Serial submit, truthful per-chunk progress (refetch as each confirms).
      const signedCertCount = [...signedByIndex.keys()].reduce(
        (n, i) => n + plans[i].certificateAddresses.length,
        0,
      );
      let signedCount = 0;
      let failedCount = allCerts.length - signedCertCount;
      for (let i = 0; i < plans.length; i++) {
        const signedBytes = signedByIndex.get(i);
        if (!signedBytes) continue; // sign stage already marked this chunk failed
        const plan = plans[i];
        try {
          await api("/api/certificator/submit", {
            json: {
              wireBytesBase64: bytesToBase64(signedBytes),
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
