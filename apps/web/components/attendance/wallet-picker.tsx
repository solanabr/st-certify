"use client";

import { useEffect, useState } from "react";
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
 * Wallet connect dialog for the attendance flows (public claim page, reused by
 * the creator sign-in). Lists every wallet-standard wallet detected in the
 * browser plus a Privy-email fallback for people without one. On a touch device
 * with no injected wallet — the QR-scan-into-mobile-browser case — it also
 * offers a Phantom deep link that reopens the current page inside Phantom's
 * in-app browser. `proof` is owned by the caller so both surfaces can share (or
 * isolate) the same `useWalletProof()` instance.
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
  const [phantomUrl, setPhantomUrl] = useState<string | null>(null);

  // Coarse-pointer + no-hover ≈ a phone; only there does reopening in Phantom's
  // in-app browser help. Computed client-side to avoid a hydration mismatch.
  // 2026-08: Phantom universal-link shape (/ul/v1/browse/<url>?ref=<origin>) —
  // vendor params drift; re-verify against Phantom's deep-link docs
  // periodically. A dead scheme soft-fails (the link simply does nothing).
  useEffect(() => {
    const isMobile = window.matchMedia(
      "(pointer: coarse) and (hover: none)",
    ).matches;
    if (!isMobile) return;
    const current = window.location.href;
    const ref = window.location.origin;
    setPhantomUrl(
      `https://phantom.app/ul/v1/browse/${encodeURIComponent(current)}?ref=${encodeURIComponent(ref)}`,
    );
  }, []);

  async function handleConnect(wallet: WalletHandle): Promise<void> {
    try {
      await proof.connect(wallet);
      onOpenChange(false);
    } catch (err) {
      onAppError(err);
    }
  }

  const noWallets = proof.wallets.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("attendance.picker.title")}</DialogTitle>
          <DialogDescription>
            {t("attendance.walletNotConnected")}
          </DialogDescription>
        </DialogHeader>

        {noWallets ? (
          <p className="text-sm text-muted-foreground">
            {t("attendance.picker.empty")}
          </p>
        ) : (
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
        )}

        <Separator />

        <div className="flex flex-col gap-2">
          {noWallets && phantomUrl && (
            <Button asChild>
              <a href={phantomUrl}>{t("attendance.picker.openPhantom")}</a>
            </Button>
          )}
          <Button variant="secondary" onClick={() => proof.privyLogin()}>
            {t("attendance.picker.fallback")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
