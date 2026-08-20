"use client";

import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import type { ProofPayload } from "@/hooks/useWalletProof";
import type { ClaimPageInfo } from "@/app/api/attendance/claim/[token]/route";
import type { ClaimResult } from "@/app/api/attendance/claim/route";

interface UseClaimInfoOptions {
  /**
   * Server-rendered event info to paint instantly on the QR-scan path (UI-C1).
   * Pass only for the no-wallet query so a connected wallet's claim status is
   * never seeded from the anonymous fetch.
   */
  initialData?: ClaimPageInfo;
  /**
   * Poll (~3s) for the minted asset id to backfill, stopping once it lands
   * (P1-2a). The caller bounds how long this stays true.
   */
  pollAsset?: boolean;
}

/**
 * Public claim page's event + caller-claim info. Chain-truthful: driven by the
 * GET endpoint and refetched whenever the connected wallet changes so
 * `callerClaim` reflects that wallet.
 */
export function useClaimInfo(
  token: string,
  wallet: string | null,
  options?: UseClaimInfoOptions,
): UseQueryResult<ClaimPageInfo> {
  return useQuery({
    queryKey: ["attendance", "claim", token, wallet],
    queryFn: () =>
      api<ClaimPageInfo>(
        `/api/attendance/claim/${token}${wallet ? `?wallet=${wallet}` : ""}`,
      ),
    retry: false,
    // Connecting a wallet swaps the query key; keep the previous card visible
    // instead of dropping back to the skeleton while the new fetch runs (rq-2).
    placeholderData: keepPreviousData,
    initialData: options?.initialData,
    // State-dependent polling (webapp-architecture §5): only while the asset id
    // is still pending, and only when the caller opts in (the post-mint window).
    refetchInterval: options?.pollAsset
      ? (query) =>
          query.state.data?.callerClaim?.assetId == null ? 3_000 : false
      : false,
  });
}

export type MintStage = "idle" | "signing" | "confirming";

/**
 * The claim write path: prove wallet ownership (signature, or the
 * Privy-session shortcut inside `prove`), then POST claim — the mint is
 * operator-subsidized and happens server-side. The POST is idempotent, so a
 * retried claim resolves with `status: "already"`.
 */
export function useMintAttendance(
  token: string,
  prove: (purpose: "attendance-claim") => Promise<ProofPayload>,
): UseMutationResult<ClaimResult, Error, void> & { stage: MintStage } {
  const queryClient = useQueryClient();
  const { t } = useT();
  const [stage, setStage] = useState<MintStage>("idle");

  const mutation = useMutation<ClaimResult, Error, void>({
    mutationFn: async (): Promise<ClaimResult> => {
      setStage("signing");
      const proof = await prove("attendance-claim");

      setStage("confirming");
      return api<ClaimResult>("/api/attendance/claim", {
        json: { token, ...proof },
      });
    },
    onSuccess: (data) => {
      setStage("idle");
      toast.success(
        t(
          data.status === "minted"
            ? "attendance.claim.success"
            : "attendance.claim.already",
        ),
      );
      void queryClient.invalidateQueries({
        queryKey: ["attendance", "claim", token],
      });
    },
    // Errors surface inline on the claim card (P1-2d) rather than as a toast,
    // so onError only resets the stage — the component branches on `mint.error`.
    onError: () => setStage("idle"),
  });

  return { ...mutation, stage };
}
