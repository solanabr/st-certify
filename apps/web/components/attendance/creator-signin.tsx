"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WalletPicker } from "@/components/attendance/wallet-picker";
import { useCreatorSignin } from "@/hooks/useAttendanceEvents";
import { useWalletProof } from "@/hooks/useWalletProof";
import { toAppError } from "@/lib/errors";
import { useT } from "@/lib/i18n";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Gate shown on `/events` until the connected wallet proves it's on the
 * creator allowlist (`requireAttendanceCreator`). `ATTENDANCE_NOT_CREATOR` is
 * surfaced inline — not just the toast `useCreatorSignin` already fires —
 * since a bare toast is easy to miss on a page that otherwise looks blank.
 */
export function CreatorSignin({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useT();
  const proof = useWalletProof();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Tracks which address the last signin attempt was for, so switching to a
  // different wallet after a denial doesn't keep showing the old wallet's
  // "not authorized" banner until the new one is actually tried.
  const [attemptedAddress, setAttemptedAddress] = useState<string | null>(null);
  const signin = useCreatorSignin(proof.prove);

  const denied =
    signin.isError &&
    attemptedAddress === proof.selected?.account.address &&
    toAppError(signin.error).code === "ATTENDANCE_NOT_CREATOR";

  function handlePrimary(): void {
    if (!proof.selected) {
      setPickerOpen(true);
      return;
    }
    setAttemptedAddress(proof.selected.account.address);
    signin.mutate(undefined, { onSuccess: onSignedIn });
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <p className="text-lg font-semibold">{t("attendance.signin.title")}</p>
        <p className="text-sm text-muted-foreground">
          {t("attendance.signin.body")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {denied && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>{t("attendance.signin.denied")}</AlertTitle>
          </Alert>
        )}

        {proof.selected && (
          <p className="text-sm text-muted-foreground">
            {t("attendance.picker.connected", {
              address: truncateAddress(proof.selected.account.address),
            })}
          </p>
        )}

        <Button
          className="w-full"
          disabled={signin.isPending}
          aria-busy={signin.isPending}
          onClick={handlePrimary}
        >
          {signin.isPending && (
            <Loader2 className="animate-spin" aria-hidden="true" />
          )}
          {proof.selected
            ? t("attendance.signin.cta")
            : t("attendance.picker.title")}
        </Button>
      </CardContent>

      <WalletPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        proof={proof}
      />
    </Card>
  );
}
