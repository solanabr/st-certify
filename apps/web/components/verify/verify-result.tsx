import { Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SignerTable } from "@/components/verify/signer-table";
import { VerifyChainStamp } from "@/components/verify/verify-chain-stamp";
import { VerifyStatusBanner } from "@/components/verify/verify-status-banner";
import { CopyLinkButton } from "@/components/verify/copy-link-button";
import type { VerifyCertView } from "@/lib/db/claim-verify-queries";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function certNumberLabel(view: VerifyCertView): string {
  if (view.certNumber === null) return "—";
  return view.maxSupply
    ? `#${view.certNumber} de ${view.maxSupply}`
    : `#${view.certNumber}`;
}

function DetailGrid({ view }: { view: VerifyCertView }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      <div className="col-span-2">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          Aluno
        </dt>
        {/* Loudest cell — the human trust anchor (plan §Security #2). */}
        <dd className="text-lg font-semibold">{view.studentName}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          Nº
        </dt>
        <dd className="tabular-nums">{certNumberLabel(view)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          Data
        </dt>
        <dd className="tabular-nums">
          {formatDate(view.completionDate ?? view.completedAt)}
        </dd>
      </div>
      <div className="col-span-2 sm:col-span-4">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          Edição
        </dt>
        <dd>{view.editionName}</dd>
      </div>
    </dl>
  );
}

function CertificateImage({
  view,
  dimmed,
}: {
  view: VerifyCertView;
  dimmed?: boolean;
}) {
  if (!view.imageUrl) return null;
  return (
    <div className="relative overflow-hidden rounded-lg border border-border">
      {/* eslint-disable-next-line @next/next/no-img-element -- content-addressed external asset, not Next-optimizable */}
      <img
        src={view.imageUrl}
        alt={`Certificado de ${view.studentName}`}
        className={dimmed ? "w-full opacity-40 grayscale" : "w-full"}
      />
      {dimmed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-destructive px-4 py-2 text-lg font-bold uppercase tracking-widest text-destructive-foreground">
            Revogado
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The server-rendered verify verdict (RSC — instant paint + OG). Its states are
 * the page: REVOKED / valid (Claimed) / pending / rejected. The live
 * "verificado onchain" stamp + NFT link are added by the `VerifyChainStamp`
 * client island so the certificate's authoritative on-chain state is what the
 * viewer ultimately trusts.
 */
export function VerifyResult({
  view,
  reencode = false,
}: {
  view: VerifyCertView;
  reencode?: boolean;
}) {
  // Mirror-derived; used only for the image dim treatment and the download-
  // button gate below. The hero banner (VerifyStatusBanner) computes its own
  // chain-aware revoked flag independently — see that component's doc comment
  // for why these two can briefly disagree and why that's fine.
  const isRevoked = view.status === "Revoked";
  const isRejected = view.status === "Rejected";

  return (
    <div className="space-y-6">
      <VerifyStatusBanner
        certAddress={view.address}
        mirrorStatus={view.status}
        revokeReason={view.revokeReason}
        reencode={reencode}
      />

      <Card>
        <CardContent className="space-y-6">
          <DetailGrid view={view} />
          <CertificateImage view={view} dimmed={isRevoked} />

          <VerifyChainStamp
            certAddress={view.address}
            mirrorStatus={view.status}
          />

          {(view.imageUrl || !isRejected) && (
            <div className="flex flex-wrap gap-2">
              {view.imageUrl && !isRevoked && (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={view.imageUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download /> Baixar
                  </a>
                </Button>
              )}
              <CopyLinkButton path={`/verify/${view.address}`} />
            </div>
          )}
        </CardContent>
      </Card>

      {view.signers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Assinaturas
          </h2>
          <SignerTable signers={view.signers} />
        </div>
      )}
    </div>
  );
}
