"use client";

import { BadgeCheck, ShieldX, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCertificateChainCheck } from "@/components/verify/verify-chain-stamp";
import type { CertificateStatusValue } from "@/lib/db/types";
import { useT } from "@/lib/i18n";

/**
 * The hero verdict banner. Paints instantly from the mirror (RSC), then layers
 * the browser chain-check so "chain wins" (plan §Security #4) applies to the
 * hero banner too — not just the "verificado onchain" stamp further down the
 * page. Without this, a stale-mirror-revoked certificate showed a green
 * "Certificado válido" alert here with `VerifyChainStamp`'s red revoked line
 * sitting right below it in the same card — a contradictory verdict on one
 * page. It subscribes to the very same query as `VerifyChainStamp` and
 * `VerifyMediaPanel` (one fetch for the whole page) and, if chain disagrees
 * toward Revoked, swaps this banner to match. A chain-check failure here is
 * silently ignored — `VerifyChainStamp` below still surfaces its own "não foi
 * possível confirmar" state, so the page never hides a real problem, it just
 * doesn't duplicate that messaging up here.
 */
export function VerifyStatusBanner({
  certAddress,
  mirrorStatus,
  revokeReason,
  reencode,
}: {
  certAddress: string;
  mirrorStatus: CertificateStatusValue;
  revokeReason: string | null;
  reencode: boolean;
}) {
  const { t } = useT();
  const { data: verdict } = useCertificateChainCheck(certAddress);
  const chainRevoked = verdict?.exists === true && verdict.status === "Revoked";

  const isRevoked = mirrorStatus === "Revoked" || chainRevoked;
  const isClaimed = !isRevoked && mirrorStatus === "Claimed";
  const isPending =
    !isRevoked &&
    (mirrorStatus === "Requested" || mirrorStatus === "FullySigned");
  const isRejected = !isRevoked && mirrorStatus === "Rejected";

  return (
    <>
      {isRevoked && (
        <Alert variant="destructive">
          <ShieldX />
          <AlertTitle>{t("verify.banner.revokedTitle")}</AlertTitle>
          <AlertDescription>
            {revokeReason || t("verify.banner.revokedBody")}
          </AlertDescription>
        </Alert>
      )}

      {isClaimed && (
        <Alert className="border-success text-success [&>svg]:text-success">
          <BadgeCheck />
          <AlertTitle>{t("verify.banner.validTitle")}</AlertTitle>
          <AlertDescription className="text-foreground">
            {t("verify.banner.validBody")}
          </AlertDescription>
        </Alert>
      )}

      {isClaimed && reencode && (
        <Alert className="border-warning text-warning [&>svg]:text-warning">
          <TriangleAlert />
          <AlertTitle>{t("verify.banner.reencodeTitle")}</AlertTitle>
          <AlertDescription className="text-foreground">
            {t("verify.banner.reencodeBody")}
          </AlertDescription>
        </Alert>
      )}

      {isPending && (
        <Alert className="border-warning text-warning [&>svg]:text-warning">
          <TriangleAlert />
          <AlertTitle>{t("verify.banner.pendingTitle")}</AlertTitle>
          <AlertDescription className="text-foreground">
            {t("verify.banner.pendingBody")}
          </AlertDescription>
        </Alert>
      )}

      {isRejected && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>{t("verify.banner.invalidTitle")}</AlertTitle>
          <AlertDescription>{t("verify.banner.invalidBody")}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
