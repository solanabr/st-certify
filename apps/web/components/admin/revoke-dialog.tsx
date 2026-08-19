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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRevoke } from "@/hooks/useRevoke";
import { useT } from "@/lib/i18n";
import { revokeSchema } from "@/lib/schemas";

/**
 * The destructive revoke confirm (plan §Revoke): names the student, requires a
 * reason, no optimism — the trigger button spins until the server (2 admin
 * signatures + best-effort burn) confirms, then the dialog closes and the admin
 * lists refetch.
 */
export function RevokeCell({
  certificateAddress,
  studentName,
}: {
  certificateAddress: string;
  studentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const revoke = useRevoke();
  const { t } = useT();

  function onConfirm(): void {
    const parsed = revokeSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? t("admin.revoke.invalidReason"),
      );
      return;
    }
    setError(null);
    revoke.mutate(
      { certificateAddress, reason: parsed.data.reason },
      {
        onSuccess: () => {
          setOpen(false);
          setReason("");
        },
      },
    );
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!revoke.isPending) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={revoke.isPending}
        >
          {revoke.isPending && (
            <Loader2 className="animate-spin" aria-hidden="true" />
          )}
          {t("admin.revoke.action")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("admin.revoke.title", { name: studentName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("admin.revoke.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="revoke-reason">{t("admin.revoke.reasonLabel")}</Label>
          <Textarea
            id="revoke-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            placeholder={t("admin.revoke.reasonPlaceholder")}
            disabled={revoke.isPending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "revoke-reason-error" : undefined}
          />
          {error && (
            <p
              id="revoke-reason-error"
              className="text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoke.isPending}>
            {t("admin.cancel")}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={revoke.isPending}
          >
            {revoke.isPending && (
              <Loader2 className="animate-spin" aria-hidden="true" />
            )}
            {t("admin.revoke.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
