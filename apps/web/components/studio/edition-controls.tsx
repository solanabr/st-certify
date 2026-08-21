"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useSetEditionStatus } from "@/hooks/useSetEditionStatus";
import { onAppError } from "@/lib/on-app-error";
import { useT } from "@/lib/i18n";
import type { StudioEditionView } from "@/components/studio/use-studio-edition";

/**
 * Open/pause is a toggle; closing is not — a closed edition cannot be
 * reopened, so it gets a confirm step. A draft has no on-chain status yet and
 * renders nothing here.
 */
export function EditionControls({ edition }: { edition: StudioEditionView }) {
  const { t } = useT();
  const setStatus = useSetEditionStatus();
  const [confirmClose, setConfirmClose] = useState(false);

  const address = edition.chainAddress;
  if (!address || edition.status === null) {
    return null;
  }

  const status = edition.status;

  function apply(next: "Open" | "Paused" | "Closed"): void {
    if (!address) return;
    setStatus.mutate(
      { address, status: next },
      {
        onSuccess: () => setConfirmClose(false),
        onError: (err) => onAppError(err),
      },
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status !== "Closed" && (
          <Button
            size="sm"
            variant="outline"
            disabled={setStatus.isPending}
            aria-busy={setStatus.isPending}
            onClick={() => apply(status === "Open" ? "Paused" : "Open")}
          >
            {setStatus.isPending && (
              <Loader2 className="animate-spin" aria-hidden="true" />
            )}
            {status === "Open" ? t("admin.pause") : t("admin.open")}
          </Button>
        )}
        {status !== "Closed" && (
          <Button
            size="sm"
            variant="outline"
            disabled={setStatus.isPending}
            onClick={() => setConfirmClose(true)}
          >
            {t("admin.manage.close")}
          </Button>
        )}
      </div>

      <AlertDialog
        open={confirmClose}
        onOpenChange={(next) => {
          if (!next && !setStatus.isPending) setConfirmClose(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("admin.manage.closeConfirmTitle", { name: edition.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.manage.closeConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setStatus.isPending}>
              {t("admin.cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={setStatus.isPending}
              aria-busy={setStatus.isPending}
              onClick={() => apply("Closed")}
            >
              {setStatus.isPending && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}
              {t("admin.manage.close")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
