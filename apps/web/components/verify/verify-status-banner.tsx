"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ShieldX, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { checkCertificateOnChain } from "@/lib/chain/verify";
import type { CertificateStatusValue } from "@/lib/db/types";

/**
 * The hero verdict banner. Paints instantly from the mirror (RSC), then layers
 * a one-shot chain-check so "chain wins" (plan §Security #4) applies to the
 * hero banner too — not just the "verificado onchain" stamp further down the
 * page. Without this, a stale-mirror-revoked certificate showed a green
 * "Certificado válido" alert here with `VerifyChainStamp`'s red revoked line
 * sitting right below it in the same card — a contradictory verdict on one
 * page. If the mirror already says Revoked there's nothing to reconcile (the
 * common case, zero extra work); otherwise this fires the same
 * `checkCertificateOnChain` read `VerifyChainStamp` uses and, if chain
 * disagrees toward Revoked, swaps this banner to match. A chain-check failure
 * here is silently ignored — `VerifyChainStamp` below still surfaces its own
 * "não foi possível confirmar" state, so the page never hides a real problem,
 * it just doesn't duplicate that messaging up here.
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
        // Non-fatal: VerifyChainStamp surfaces its own failure state.
      });
    return () => {
      active = false;
    };
  }, [certAddress, mirrorStatus]);

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
          <AlertTitle>Certificado revogado</AlertTitle>
          <AlertDescription>
            {revokeReason ||
              "Este certificado foi revogado e não é mais válido."}
          </AlertDescription>
        </Alert>
      )}

      {isClaimed && (
        <Alert className="border-success text-success [&>svg]:text-success">
          <BadgeCheck />
          <AlertTitle>Certificado válido</AlertTitle>
          <AlertDescription className="text-foreground">
            Este certificado foi emitido pela Superteam Brasil e registrado
            on-chain.
          </AlertDescription>
        </Alert>
      )}

      {isClaimed && reencode && (
        <Alert className="border-warning text-warning [&>svg]:text-warning">
          <TriangleAlert />
          <AlertTitle>Arquivo é uma recodificação</AlertTitle>
          <AlertDescription className="text-foreground">
            Válido — mas este arquivo é uma recodificação (ex.: captura de
            tela). O original verificável está abaixo.
          </AlertDescription>
        </Alert>
      )}

      {isPending && (
        <Alert className="border-warning text-warning [&>svg]:text-warning">
          <TriangleAlert />
          <AlertTitle>Certificado em andamento</AlertTitle>
          <AlertDescription className="text-foreground">
            As assinaturas ainda estão sendo coletadas — este certificado ainda
            não foi resgatado.
          </AlertDescription>
        </Alert>
      )}

      {isRejected && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Certificado não válido</AlertTitle>
          <AlertDescription>
            Esta solicitação foi encerrada e não corresponde a um certificado
            emitido.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
