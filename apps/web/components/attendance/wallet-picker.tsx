"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { onAppError } from "@/lib/on-app-error";
import { useT } from "@/lib/i18n";
import type { useWalletProof } from "@/hooks/useWalletProof";
import type { WalletHandle } from "@/lib/wallet";

/**
 * Wallet connect dialog for the attendance flows (public claim page, and
 * reused by the creator sign-in in Task 14). Lists every wallet-standard
 * wallet detected in the browser plus a Privy-email fallback for people
 * without one — `proof` is owned by the caller so both surfaces can share
 * (or isolate) the same `useWalletProof()` instance.
 */
export function WalletPicker({
  open,
  onOpenChange,
  proof,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proof: ReturnType<typeof useWalletProof>;
}) {
  const { t } = useT();

  async function handleConnect(wallet: WalletHandle): Promise<void> {
    try {
      await proof.connect(wallet);
      onOpenChange(false);
    } catch (err) {
      onAppError(err);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("attendance.picker.title")}</DialogTitle>
          <DialogDescription>
            {t("attendance.walletNotConnected")}
          </DialogDescription>
        </DialogHeader>

        {proof.wallets.length > 0 ? (
          <div className="flex flex-col gap-2">
            {proof.wallets.map((wallet) => (
              <Button
                key={wallet.name}
                variant="outline"
                className="justify-start gap-3"
                onClick={() => void handleConnect(wallet)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- wallet-standard icon is a data: URI, not a local/Next-optimizable asset */}
                <img
                  src={wallet.icon}
                  alt=""
                  aria-hidden="true"
                  className="size-5 rounded-sm"
                />
                {wallet.name}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("attendance.picker.empty")}
          </p>
        )}

        <Separator />

        <Button variant="ghost" onClick={() => proof.privyLogin()}>
          {t("attendance.picker.fallback")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
