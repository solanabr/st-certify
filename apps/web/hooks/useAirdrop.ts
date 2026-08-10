"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { api } from "@/lib/api-client";

interface AirdropResponse {
  signature: string;
}

/** Devnet airdrop button on /me's wallet strip. Server enforces the per-DID rate limit + faucet fallback. */
export function useAirdrop(): UseMutationResult<
  AirdropResponse,
  Error,
  { wallet: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { wallet: string }) =>
      api<AirdropResponse>("/api/airdrop", { json: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
    },
  });
}
