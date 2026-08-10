"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import {
  checkCertificateOnChain,
  reconcileChainVerdict,
  type OnChainVerdict,
} from "@/lib/chain/verify";
import type { CertificateStatusValue } from "@/lib/db/types";

type State =
  | { phase: "loading" }
  | { phase: "done"; verdict: OnChainVerdict }
  | { phase: "error" };

/**
 * The browser chain-check layered over the server-rendered verdict: a one-shot
 * `checkCertificateOnChain` that yields the "verificado onchain · slot N" stamp
 * and — critically — renders the NFT link from `Certificate.asset` read LIVE
 * from chain (the back-reference doctrine: the link is never taken from the
 * possibly-stale mirror). Chain wins on any drift.
 */
export function VerifyChainStamp({
  certAddress,
  mirrorStatus,
}: {
  certAddress: string;
  mirrorStatus: CertificateStatusValue;
}) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let active = true;
    checkCertificateOnChain(certAddress)
      .then((verdict) => {
        if (active) setState({ phase: "done", verdict });
      })
      .catch(() => {
        if (active) setState({ phase: "error" });
      });
    return () => {
      active = false;
    };
  }, [certAddress]);

  if (state.phase === "loading") {
    return (
      <p
        className="flex items-center gap-2 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Verificando on-chain…
      </p>
    );
  }

  if (state.phase === "error" || !state.verdict.exists) {
    return (
      <p
        className="flex items-center gap-2 text-sm text-warning"
        aria-live="polite"
      >
        <TriangleAlert className="size-4" aria-hidden="true" />
        Não foi possível confirmar este certificado on-chain no momento.
      </p>
    );
  }

  const { verdict } = state;
  const reconcile = reconcileChainVerdict({
    exists: verdict.exists,
    chainStatus: verdict.status,
    chainAsset: verdict.asset,
    mirrorStatus,
  });

  // Chain wins: a live Revoked status overrides any (possibly stale) valid mirror
  // banner with a destructive state, and never surfaces the NFT link.
  if (reconcile.revoked) {
    return (
      <p
        className="flex flex-wrap items-center gap-2 text-sm font-medium text-destructive"
        aria-live="polite"
      >
        <ShieldX className="size-4" aria-hidden="true" />
        Revogado on-chain — este certificado não é mais válido.
        <span className="tabular-nums font-normal text-muted-foreground">
          · slot {verdict.slot}
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-3" aria-live="polite">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <ShieldCheck className="size-4 text-success" aria-hidden="true" />
        <span
          className="font-medium"
          style={{
            backgroundImage: "linear-gradient(90deg, #9945FF, #14F195)",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "0 100%",
            backgroundSize: "100% 2px",
            paddingBottom: "2px",
          }}
        >
          verificado onchain
        </span>
        <span className="tabular-nums text-muted-foreground">
          · slot {verdict.slot}
        </span>
      </p>

      {reconcile.showNftLink && reconcile.nftAsset && (
        <a
          href={`https://explorer.solana.com/address/${reconcile.nftAsset}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Ver NFT (intransferível) no Explorer
        </a>
      )}

      {reconcile.drifted && (
        <p className="flex items-center gap-2 text-sm text-warning">
          <TriangleAlert className="size-4" aria-hidden="true" />A rede tem uma
          atualização mais recente — exibindo o estado on-chain.
        </p>
      )}
    </div>
  );
}
