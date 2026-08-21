"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { onAppError } from "@/lib/on-app-error";

/**
 * Re-sends one seat's invite. Only reachable for seats that came from a
 * draft's `signer_invites` — an on-chain roster has no invite to re-send — so
 * `draftId` is always a real draft here.
 *
 * The route rate-limits server-side (`notifyOnce`, minIntervalHours 20); a
 * deduped send still resolves, and `deduped` is what distinguishes "we sent
 * it" from "they were reminded recently" in the toast.
 */
export function useSeatRemind(
  draftId: string,
): UseMutationResult<{ sent: boolean; deduped: boolean }, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation({
    mutationFn: (inviteId: string) =>
      api<{ sent: boolean; deduped: boolean }>(
        `/api/studio/drafts/${draftId}/invites/${inviteId}/remind`,
        { json: {} },
      ),
    onSuccess: (result) => {
      toast.success(
        result.deduped
          ? t("admin.manage.seats.resendDeduped")
          : t("admin.manage.seats.resent"),
      );
      void queryClient.invalidateQueries({
        queryKey: ["studio", "draft", draftId],
      });
    },
    onError: (err) => onAppError(err),
  });
}
