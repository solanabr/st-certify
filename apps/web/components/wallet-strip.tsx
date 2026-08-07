"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAirdrop } from "@/hooks/useAirdrop";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { onAppError } from "@/lib/on-app-error";

const LOW_BALANCE_LAMPORTS = 10_000_000n; // 0.01 SOL

function lamportsToSol(lamports: bigint): string {
  return (Number(lamports) / 1_000_000_000).toFixed(4);
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletStrip({ wallet }: { wallet: string }) {
  const { data: balance, isLoading } = useWalletBalance(wallet);
  const airdrop = useAirdrop();
  const lowBalance = balance !== undefined && balance < LOW_BALANCE_LAMPORTS;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm">{truncateAddress(wallet)}</span>
        {isLoading ? (
          <Skeleton className="h-4 w-16" />
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
          {airdrop.isPending ? "Enviando…" : "Airdrop 1 SOL"}
        </Button>
      )}
    </div>
  );
}
