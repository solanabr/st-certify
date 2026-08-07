"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerifyChainStamp } from "@/components/verify/verify-chain-stamp";
import { CopyLinkButton } from "@/components/verify/copy-link-button";
import { checkCertificateOnChain } from "@/lib/chain/verify";
import type { CertificateStatusValue } from "@/lib/db/types";

/**
 * The certificate image + download/copy actions — chain-aware like
 * VerifyStatusBanner: paints from the mirror instantly, then layers the same
 * one-shot `checkCertificateOnChain` read so a stale-mirror-revoked cert
 * (chain already says Revoked, mirror hasn't synced yet) dims the image and
 * hides the download link too, not just the hero banner above. Wraps
 * VerifyChainStamp so the "verificado onchain" stamp keeps its exact position
 * between the image and the actions row.
 */
export function VerifyMediaPanel({
  certAddress,
  mirrorStatus,
  imageUrl,
  studentName,
  isRejected,
}: {
  certAddress: string;
  mirrorStatus: CertificateStatusValue;
  imageUrl: string | null;
  studentName: string;
  isRejected: boolean;
}) {
  const [chainRevoked, setChainRevoked] = useState(false);

  useEffect(() => {
    if (mirrorStatus === "Revoked") return;
    let active = true;
    checkCertificateOnChain(certAddress)
      .then((verdict) => {
        if (active && verdict.exists && verdict.status === "Revoked") {
          setChainRevoked(true);
        }
      })
      .catch(() => {
        // Non-fatal: VerifyChainStamp below surfaces its own failure state.
      });
    return () => {
      active = false;
    };
  }, [certAddress, mirrorStatus]);

  const revoked = mirrorStatus === "Revoked" || chainRevoked;

  return (
    <>
      {imageUrl && (
        <div className="relative overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- content-addressed external asset, not Next-optimizable */}
          <img
            src={imageUrl}
            alt={`Certificado de ${studentName}`}
            className={revoked ? "w-full opacity-40 grayscale" : "w-full"}
          />
          {revoked && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-md bg-destructive px-4 py-2 text-lg font-bold uppercase tracking-widest text-destructive-foreground">
                Revogado
              </span>
            </div>
          )}
        </div>
      )}

      <VerifyChainStamp certAddress={certAddress} mirrorStatus={mirrorStatus} />

      {(imageUrl || !isRejected) && (
        <div className="flex flex-wrap gap-2">
          {imageUrl && !revoked && (
            <Button asChild variant="outline" size="sm">
              <a
                href={imageUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download /> Baixar
              </a>
            </Button>
          )}
          <CopyLinkButton path={`/verify/${certAddress}`} />
        </div>
      )}
    </>
  );
}
