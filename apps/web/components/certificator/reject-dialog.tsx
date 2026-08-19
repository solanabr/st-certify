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
import { useT } from "@/lib/i18n";

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
  const { t } = useT();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (target) setReason("");
  }, [target]);

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("certificator.rejectTitle", {
              name: target?.studentName ?? "",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("certificator.rejectDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reject-reason">{t("certificator.reasonLabel")}</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("certificator.reasonPlaceholder")}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("certificator.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason)}
            disabled={pending}
          >
            {pending ? t("certificator.rejecting") : t("certificator.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
