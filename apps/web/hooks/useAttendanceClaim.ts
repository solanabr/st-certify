"use client";

import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { onAppError } from "@/lib/on-app-error";
import { useT } from "@/lib/i18n";
import type { ProofPayload } from "@/hooks/useWalletProof";
import type { ClaimPageInfo } from "@/app/api/attendance/claim/[token]/route";
import type { ClaimResult } from "@/app/api/attendance/claim/route";

/**
 * Public claim page's event + caller-claim info. Polls every 5s ONLY while
 * the caller's claim is minted but its asset id hasn't backfilled yet (the
 * route resolves it best-effort via `after()`) — idle otherwise.
 */
export function useClaimInfo(
  token: string,
  wallet: string | null,
): UseQueryResult<ClaimPageInfo> {
  return useQuery({
    queryKey: ["attendance", "claim", token, wallet],
    queryFn: () =>
      api<ClaimPageInfo>(
        `/api/attendance/claim/${token}${wallet ? `?wallet=${wallet}` : ""}`,
      ),
    retry: false,
    refetchInterval: (query) => {
      const claim = query.state.data?.callerClaim;
      return claim?.status === "minted" && !claim.assetId ? 5_000 : false;
    },
  });
}

export type MintStage = "idle" | "signing" | "confirming";

/**
 * The claim write path: prove wallet ownership (signature, or the
 * Privy-session shortcut inside `prove`), then POST claim — the mint is
 * operator-subsidized and happens server-side. Stage pattern mirrors
 * useClaim.ts.
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
    onSuccess: () => {
      setStage("idle");
      toast.success(t("attendance.claim.success"));
      void queryClient.invalidateQueries({
        queryKey: ["attendance", "claim", token],
      });
    },
    onError: (err) => {
      setStage("idle");
      onAppError(err);
    },
  });

  return { ...mutation, stage };
}
