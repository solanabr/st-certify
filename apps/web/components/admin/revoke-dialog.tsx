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

  function onConfirm(): void {
    const parsed = revokeSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Motivo inválido.");
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
          Revogar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Revogar certificado de {studentName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação é permanente: o certificado passa a REVOGADO na
            verificação pública e o NFT é queimado quando possível.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="revoke-reason">Motivo</Label>
          <Textarea
            id="revoke-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Ex.: emitido por engano; dados incorretos."
            disabled={revoke.isPending}
            aria-invalid={error ? true : undefined}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoke.isPending}>
            Cancelar
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={revoke.isPending}
          >
            {revoke.isPending && (
              <Loader2 className="animate-spin" aria-hidden="true" />
            )}
            Revogar certificado
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
