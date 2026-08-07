"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface RejectTarget {
  certificateAddress: string;
  editionAddress: string;
  studentName: string;
  /** cert.student == owner_wallet — the on-chain refund recipient. */
  ownerWallet: string;
  /** The certifier's registered wallet for this edition. */
  signerWallet: string;
}

/**
 * Reject-with-refund dialog. Radix Dialog gives focus-trap + Escape for free.
 * Names the object being rejected (webapp-polish: destructive actions name the
 * target); the reason is off-chain (event log only).
 */
export function RejectDialog({
  target,
  pending,
  onOpenChange,
  onConfirm,
}: {
  target: RejectTarget | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (target) setReason("");
  }, [target]);

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Rejeitar certificado de {target?.studentName}
          </DialogTitle>
          <DialogDescription>
            A solicitação será encerrada e o valor do aluguel devolvido
            automaticamente ao estudante. O motivo fica registrado no histórico
            (não vai para a blockchain). O estudante pode solicitar novamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reject-reason">Motivo (opcional)</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: nome não confere com o documento."
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason)}
            disabled={pending}
          >
            {pending ? "Rejeitando…" : "Rejeitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
