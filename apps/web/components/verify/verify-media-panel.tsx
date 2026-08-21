"use client";

import { Download, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  VerifyChainStamp,
  useCertificateChainCheck,
} from "@/components/verify/verify-chain-stamp";
import { CopyLinkButton } from "@/components/verify/copy-link-button";
import { useT } from "@/lib/i18n";
import type { CertificateStatusValue } from "@/lib/db/types";

/**
 * The certificate image + download/copy actions — chain-aware like
 * VerifyStatusBanner: paints from the mirror instantly, then layers the shared
 * chain-check (same query as the VerifyChainStamp it wraps — one fetch, not
 * two) so a stale-mirror-revoked cert (chain already says Revoked, mirror
 * hasn't synced yet) dims the image and hides the download link too, not just
 * the hero banner above. Wrapping the stamp keeps the "verificado onchain" line
 * in its exact position between the image and the actions row.
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
  const { t } = useT();
  // A failed check leaves `data` undefined — non-fatal here, since the
  // VerifyChainStamp below surfaces the failure state itself.
  const { data: verdict } = useCertificateChainCheck(certAddress);
  const chainRevoked = verdict?.exists === true && verdict.status === "Revoked";
  const revoked = mirrorStatus === "Revoked" || chainRevoked;

  return (
    <>
      {imageUrl && (
        <div className="relative overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- content-addressed external asset, not Next-optimizable */}
          <img
            src={imageUrl}
            alt={t("verify.media.imageAlt", { student: studentName })}
            className={revoked ? "w-full opacity-40 grayscale" : "w-full"}
          />
          {revoked && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-md bg-destructive px-4 py-2 text-lg font-bold uppercase tracking-widest text-destructive-foreground">
                {t("verify.media.revokedStamp")}
              </span>
            </div>
          )}
        </div>
      )}

      <VerifyChainStamp certAddress={certAddress} mirrorStatus={mirrorStatus} />

      {(imageUrl || !isRejected) && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {/* The PDF exists only once the certificate is claimed, and a revoked
              one must not hand out a fresh signed copy. */}
          {mirrorStatus === "Claimed" && !revoked && (
            <Button asChild size="sm">
              <a href={`/api/certificates/${certAddress}/pdf`}>
                <FileText /> {t("verify.pdf.download")}
              </a>
            </Button>
          )}
          {imageUrl && !revoked && (
            <Button asChild variant="outline" size="sm">
              <a
                href={imageUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download /> {t("claim.download")}
              </a>
            </Button>
          )}
          <CopyLinkButton path={`/verify/${certAddress}`} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="hidden sm:inline-flex"
          >
            <Printer /> {t("verify.print")}
          </Button>
        </div>
      )}
    </>
  );
}
