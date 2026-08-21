"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAirdrop } from "@/hooks/useAirdrop";
import { useT } from "@/lib/i18n";
import { onAppError } from "@/lib/on-app-error";

/**
 * The contextual "saldo insuficiente" card (spec §6.5, D7). This is what
 * replaced the ambient WalletStrip on `/me`: the balance and the airdrop only
 * surface at the moment they block a claim, not as a permanent crypto console
 * on a page about documents.
 *
 * The airdrop invalidates `["wallet-balance"]`, so a successful drop refreshes
 * the caller's balance query on its own; `onRecheck` is for the impatient and
 * for a faucet that landed out of band.
 */
export function LowBalanceCard({
  wallet,
  onRecheck,
  isRechecking,
}: {
  wallet: string;
  onRecheck: () => void;
  isRechecking: boolean;
}) {
  const { t } = useT();
  const airdrop = useAirdrop();

  return (
    <Alert className="border-warning text-warning [&>svg]:text-warning">
      <TriangleAlert />
      <AlertTitle>{t("me.lowBalance.title")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3 text-foreground">
        <span>{t("me.lowBalance.desc")}</span>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={airdrop.isPending}
            aria-busy={airdrop.isPending}
            onClick={() =>
              airdrop.mutate({ wallet }, { onError: (err) => onAppError(err) })
            }
          >
            {airdrop.isPending
              ? t("wallet.airdropSending")
              : t("wallet.airdrop")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isRechecking}
            onClick={onRecheck}
          >
            <RefreshCw aria-hidden="true" />
            {t("me.lowBalance.recheck")}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
