"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClaim, type ClaimStage } from "@/hooks/useClaim";
import { useT, type TranslationKey } from "@/lib/i18n";
import type { CertificateForOwner } from "@/lib/db/types";

const STAGE_KEY: Record<Exclude<ClaimStage, "idle">, TranslationKey> = {
  rendering: "claim.rendering",
  signing: "claim.awaitingSignature",
  confirming: "claim.confirming",
};

/**
 * The live "Resgatar certificado" action (replaces M3's placeholder). Drives the
 * pre-claim stepper (Renderizando → Sua assinatura → Confirmando); once the
 * claim confirms, the card's own Claimed state takes over — "Emitindo NFT…" then
 * the image reveal — driven by chain-truthful /me polling, not this component.
 */
export function ClaimAction({ cert }: { cert: CertificateForOwner }) {
  const { t } = useT();
  const { mutate, stage, isPending } = useClaim();
  const label = stage === "idle" ? t("claim.action") : t(STAGE_KEY[stage]);

  return (
    <div className="mt-6">
      <Button
        className="w-full"
        disabled={isPending}
        aria-busy={isPending}
        onClick={() => mutate({ certificateAddress: cert.address })}
      >
        {isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {label}
      </Button>
      {isPending && (
        <p
          className="mt-2 text-center text-sm text-muted-foreground"
          aria-live="polite"
        >
          {label}
        </p>
      )}
    </div>
  );
}
