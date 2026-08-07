"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { onAppError } from "@/lib/on-app-error";

interface RevokeResponse {
  signature: string | null;
  burned: boolean;
  alreadyRevoked: boolean;
}

export interface RevokeVars {
  certificateAddress: string;
  reason: string;
}

/**
 * Admin revoke: POSTs to the sysadmin-gated route (two server-held admin
 * signatures + best-effort burn happen server-side). No optimism — the row stays
 * in its pending state until this resolves, then the admin lists refetch.
 */
export function useRevoke(): UseMutationResult<
  RevokeResponse,
  Error,
  RevokeVars
> {
  const queryClient = useQueryClient();
  return useMutation<RevokeResponse, Error, RevokeVars>({
    mutationFn: (vars) =>
      api<RevokeResponse>(
        `/api/admin/certificates/${vars.certificateAddress}/revoke`,
        { json: { reason: vars.reason } },
      ),
    onSuccess: (res) => {
      toast.success(
        res.burned
          ? "Certificado revogado · NFT queimado"
          : "Certificado revogado",
      );
      void queryClient.invalidateQueries({
        queryKey: ["admin", "certificates"],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
    onError: (err) => onAppError(err),
  });
}
