"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { api } from "@/lib/api-client";

interface SetEditionStatusInput {
  address: string;
  status: "Paused" | "Open" | "Closed";
}

interface SetEditionStatusResponse {
  signature: string;
  alreadyProcessed: boolean;
}

/** Abrir/Pausar row actions on the admin Edições tab — OPERATOR-signed server-side, no wallet popup for the admin. */
export function useSetEditionStatus(): UseMutationResult<
  SetEditionStatusResponse,
  Error,
  SetEditionStatusInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ address, status }: SetEditionStatusInput) =>
      api<SetEditionStatusResponse>(`/api/admin/editions/${address}/status`, {
        json: { status },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "editions"] });
      void queryClient.invalidateQueries({ queryKey: ["editions"] });
    },
  });
}
