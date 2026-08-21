"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAirdrop } from "@/hooks/useAirdrop";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { useT } from "@/lib/i18n";
import { onAppError } from "@/lib/on-app-error";

const LOW_BALANCE_LAMPORTS = 10_000_000n; // 0.01 SOL

function lamportsToSol(lamports: bigint): string {
  return (Number(lamports) / 1_000_000_000).toFixed(4);
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletStrip({ wallet }: { wallet: string }) {
  const {
    data: balance,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useWalletBalance(wallet);
  const airdrop = useAirdrop();
  const { t } = useT();
  const lowBalance = balance !== undefined && balance < LOW_BALANCE_LAMPORTS;

  return (
    <div className="elevate flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm" title={wallet}>
          {truncateAddress(wallet)}
        </span>
        {isLoading ? (
          <Skeleton className="h-4 w-16" />
        ) : isError ? (
          // The RPC read is best-effort — say so rather than rendering a gap
          // the reader would misread as "zero balance".
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {t("wallet.balanceUnavailable")}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5"
              disabled={isFetching}
              aria-label={t("common.retry")}
              onClick={() => void refetch()}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
            </Button>
          </span>
        ) : balance !== undefined ? (
          <span className="text-sm tabular-nums text-muted-foreground">
            {lamportsToSol(balance)} SOL
          </span>
        ) : null}
      </div>

      {lowBalance && (
        <Button
          size="sm"
          variant="outline"
          disabled={airdrop.isPending}
          aria-busy={airdrop.isPending}
          onClick={() =>
            airdrop.mutate({ wallet }, { onError: (err) => onAppError(err) })
          }
        >
          {airdrop.isPending ? t("wallet.airdropSending") : t("wallet.airdrop")}
        </Button>
      )}
    </div>
  );
}
