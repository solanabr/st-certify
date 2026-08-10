import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RequestCertificateForm } from "@/components/request-certificate-form";
import { dbConfigured, getEditionBySlug } from "@/lib/db/queries";
import type { EditionStatusValue } from "@/lib/db/types";

const STATUS_LABEL: Record<EditionStatusValue, string> = {
  Open: "Aberta",
  Paused: "Pausada",
  Closed: "Encerrada",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  if (!dbConfigured) {
    return { title: "Edição | Superteam Certify" };
  }
  const { slug } = await params;
  const edition = await getEditionBySlug(slug);
  return {
    title: edition
      ? `${edition.name} | Superteam Certify`
      : "Edição não encontrada",
  };
}

export default async function EditionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!dbConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          <AlertTitle>Supabase não configurado</AlertTitle>
          <AlertDescription>
            Esta edição não pode ser carregada no momento.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { slug } = await params;
  const edition = await getEditionBySlug(slug);

  if (!edition) {
    notFound();
  }

  const supplyLabel =
    edition.maxSupply > 0
      ? `${edition.minted} de ${edition.maxSupply} certificados emitidos`
      : `${edition.minted} certificados emitidos`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div
        className="gradient-solana-accent mb-8 flex aspect-[21/9] w-full items-center justify-center rounded-xl text-4xl font-semibold text-background"
        aria-hidden="true"
      >
        {edition.name.charAt(0).toUpperCase()}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {edition.name}
        </h1>
        <Badge variant={edition.status === "Open" ? "default" : "secondary"}>
          {STATUS_LABEL[edition.status]}
        </Badge>
      </div>

      {edition.description && (
        <p className="mt-4 text-muted-foreground">{edition.description}</p>
      )}

      <p className="mt-2 text-sm text-muted-foreground tabular-nums">
        {supplyLabel}
      </p>

      {edition.signers.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">
            Signatários
          </h2>
          <ul className="mt-3 space-y-2">
            {edition.signers.map((signer) => (
              <li
                key={signer.wallet}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5"
              >
                <span className="font-medium">{signer.name}</span>
                {signer.role && (
                  <span className="text-sm text-muted-foreground">
                    {signer.role}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Separator className="my-10" />

      <div>
        <h2 className="mb-4 text-lg font-semibold">Solicitar certificado</h2>
        {edition.status === "Paused" ? (
          <Alert>
            <AlertTitle>Esta edição ainda não está aberta</AlertTitle>
            <AlertDescription>
              Volte em breve — as solicitações abrem assim que os
              administradores publicarem esta edição.
            </AlertDescription>
          </Alert>
        ) : edition.status === "Closed" ? (
          <Alert>
            <AlertTitle>Esta edição está encerrada</AlertTitle>
            <AlertDescription>
              Não é mais possível solicitar novos certificados para esta edição.
            </AlertDescription>
          </Alert>
        ) : edition.maxSupply > 0 && edition.minted >= edition.maxSupply ? (
          <Alert>
            <AlertTitle>Limite de certificados atingido</AlertTitle>
            <AlertDescription>
              Esta edição atingiu o número máximo de certificados.
            </AlertDescription>
          </Alert>
        ) : (
          <RequestCertificateForm editionAddress={edition.address} />
        )}
      </div>
    </div>
  );
}
