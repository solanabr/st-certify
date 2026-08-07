import { BadgeCheck, Download, ShieldX, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SignerTable } from "@/components/verify/signer-table";
import { VerifyChainStamp } from "@/components/verify/verify-chain-stamp";
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
  const isRevoked = view.status === "Revoked";
  const isClaimed = view.status === "Claimed";
  const isRejected = view.status === "Rejected";
  const isPending =
    view.status === "Requested" || view.status === "FullySigned";

  return (
    <div className="space-y-6">
      {isRevoked && (
        <Alert variant="destructive">
          <ShieldX />
          <AlertTitle>Certificado revogado</AlertTitle>
          <AlertDescription>
            {view.revokeReason ||
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
