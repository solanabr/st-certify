import Link from "next/link";
import { AlertTriangle, Download, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusTimeline } from "@/components/status-timeline";
import type {
  CertificateForOwner,
  CertificateStatusValue,
} from "@/lib/db/types";

const STATUS_LABEL: Record<CertificateStatusValue, string> = {
  Requested: "Em andamento",
  FullySigned: "Pronto para resgatar",
  Claimed: "Resgatado",
  Revoked: "Revogado",
  Rejected: "Rejeitado",
};

const STATUS_VARIANT: Record<
  CertificateStatusValue,
  "default" | "secondary" | "destructive" | "outline"
> = {
  Requested: "secondary",
  FullySigned: "default",
  Claimed: "default",
  Revoked: "destructive",
  Rejected: "outline",
};

function RejectedContent({ cert }: { cert: CertificateForOwner }) {
  return (
    <div className="mt-4 space-y-4">
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Solicitação rejeitada</AlertTitle>
        <AlertDescription>
          {cert.rejectReason || "Nenhum motivo foi informado."}
        </AlertDescription>
      </Alert>
      {cert.editionSlug && (
        <Button asChild variant="outline">
          <Link href={`/editions/${cert.editionSlug}`}>
            Solicitar novamente
          </Link>
        </Button>
      )}
    </div>
  );
}

function RevokedContent({ cert }: { cert: CertificateForOwner }) {
  return (
    <div className="mt-4">
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Certificado revogado</AlertTitle>
        <AlertDescription>
          {cert.revokeReason ||
            "Este certificado não é mais válido para verificação."}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ActionZone({ cert }: { cert: CertificateForOwner }) {
  if (cert.status === "FullySigned") {
    return (
      <div className="mt-6">
        <Button disabled aria-disabled="true" className="w-full">
          Resgatar certificado (disponível em breve)
        </Button>
      </div>
    );
  }

  if (cert.status === "Claimed") {
    return (
      <div className="mt-6 space-y-3">
        {!cert.asset && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Emitindo NFT…
          </p>
        )}
        {cert.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- content-addressed external asset, not a local/Next-optimizable image
          <img
            src={cert.imageUrl}
            alt={`Certificado de ${cert.studentName}`}
            className="w-full rounded-lg border border-border"
          />
        )}
        <div className="flex flex-wrap gap-2">
          {cert.imageUrl && (
            <Button asChild variant="outline" size="sm">
              <a
                href={cert.imageUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download /> Baixar
              </a>
            </Button>
          )}
          {cert.asset && (
            <Button asChild variant="outline" size="sm">
              <a
                href={`https://explorer.solana.com/address/${cert.asset}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink /> Ver NFT no Explorer
              </a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export function CertCard({ cert }: { cert: CertificateForOwner }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{cert.editionName}</p>
          <h3 className="font-semibold">{cert.studentName}</h3>
        </div>
        <Badge variant={STATUS_VARIANT[cert.status]}>
          {STATUS_LABEL[cert.status]}
        </Badge>
      </CardHeader>
      <CardContent>
        {cert.status === "Rejected" ? (
          <RejectedContent cert={cert} />
        ) : cert.status === "Revoked" ? (
          <RevokedContent cert={cert} />
        ) : (
          <>
            <StatusTimeline cert={cert} />
            <ActionZone cert={cert} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
