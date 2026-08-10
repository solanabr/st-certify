"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { EditionWizardInput } from "@/lib/schemas";

interface CreateEditionResponse {
  address: string;
  slug: string;
}

/** Wizard step 5 (QA): fires create_edition (OPERATOR-signed server-side, no admin wallet popup). */
export function useCreateEdition(): UseMutationResult<
  CreateEditionResponse,
  Error,
  EditionWizardInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: EditionWizardInput) =>
      api<CreateEditionResponse>("/api/admin/editions", { json: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "editions"] });
    },
  });
}
