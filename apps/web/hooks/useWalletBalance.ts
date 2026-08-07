"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchWalletBalanceLamports } from "@/lib/chain";

/** SOL balance in lamports for the /me wallet strip. Not chain-critical enough to poll hard — 30s is plenty. */
export function useWalletBalance(
  address: string | undefined,
): UseQueryResult<bigint> {
  return useQuery({
    queryKey: ["wallet-balance", address],
    queryFn: () => fetchWalletBalanceLamports(address!),
    enabled: Boolean(address),
    refetchInterval: 30_000,
  });
}
