"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  checkCertificateOnChain,
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
  // Chain-status vs mirror-status divergence — the chain is authoritative.
  const drifted =
    (verdict.status === "Claimed" && mirrorStatus !== "Claimed") ||
    (verdict.status === "Revoked" && mirrorStatus !== "Revoked");

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

      {verdict.asset && (
        <a
          href={`https://explorer.solana.com/address/${verdict.asset}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Ver NFT (intransferível) no Explorer
        </a>
      )}

      {drifted && (
        <p className="flex items-center gap-2 text-sm text-warning">
          <TriangleAlert className="size-4" aria-hidden="true" />A rede tem uma
          atualização mais recente — exibindo o estado on-chain.
        </p>
      )}
    </div>
  );
}
