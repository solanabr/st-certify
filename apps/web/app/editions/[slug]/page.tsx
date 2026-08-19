import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RequestCertificateForm } from "@/components/request-certificate-form";
import { dbConfigured, getEditionBySlug } from "@/lib/db/queries";
import { getT } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n";
import type { EditionStatusValue } from "@/lib/db/types";

const STATUS_LABEL_KEY: Record<EditionStatusValue, TranslationKey> = {
  Open: "editions.status.open",
  Paused: "editions.status.paused",
  Closed: "editions.status.closed",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { t } = await getT();
  if (!dbConfigured) {
    return { title: t("editions.detailMetaTitle") };
  }
  const { slug } = await params;
  const edition = await getEditionBySlug(slug);
  return {
    title: edition
      ? `${edition.name} | Superteam Certify`
      : t("editions.notFoundMetaTitle"),
  };
}

export default async function EditionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { t } = await getT();

  if (!dbConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          <AlertTitle>{t("editions.dbUnconfiguredTitle")}</AlertTitle>
          <AlertDescription>
            {t("editions.detailDbUnconfiguredDesc")}
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
      ? t("editions.supplyWithMax", {
          minted: edition.minted,
          max: edition.maxSupply,
        })
      : t("editions.supply", { minted: edition.minted });

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
          {t(STATUS_LABEL_KEY[edition.status])}
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
            {t("editions.signers")}
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
        <h2 className="mb-4 text-lg font-semibold">
          {t("student.requestCertificate")}
        </h2>
        {edition.status === "Paused" ? (
          <Alert>
            <AlertTitle>{t("editions.pausedTitle")}</AlertTitle>
            <AlertDescription>{t("editions.pausedDesc")}</AlertDescription>
          </Alert>
        ) : edition.status === "Closed" ? (
          <Alert>
            <AlertTitle>{t("editions.closedTitle")}</AlertTitle>
            <AlertDescription>{t("editions.closedDesc")}</AlertDescription>
          </Alert>
        ) : edition.maxSupply > 0 && edition.minted >= edition.maxSupply ? (
          <Alert>
            <AlertTitle>{t("editions.supplyExhaustedTitle")}</AlertTitle>
            <AlertDescription>
              {t("editions.supplyExhaustedDesc")}
            </AlertDescription>
          </Alert>
        ) : (
          <RequestCertificateForm editionAddress={edition.address} />
        )}
      </div>
    </div>
  );
}
