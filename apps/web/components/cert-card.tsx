"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  ScrollText,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusTimeline } from "@/components/status-timeline";
import { ClaimAction } from "@/components/claim/claim-action";
import { MintingStatus } from "@/components/claim/minting-status";
import { CopyLinkButton } from "@/components/verify/copy-link-button";
import { explorerAddressUrl } from "@/lib/chain/explorer-url";
import { useT, type TranslationKey } from "@/lib/i18n";
import type {
  CertificateForOwner,
  CertificateStatusValue,
} from "@/lib/db/types";

const STATUS_LABEL_KEY: Record<CertificateStatusValue, TranslationKey> = {
  Requested: "student.status.requested",
  FullySigned: "student.status.fullySigned",
  Claimed: "student.status.claimed",
  Revoked: "student.status.revoked",
  Rejected: "student.status.rejected",
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
  const { t } = useT();

  return (
    <div className="mt-4 space-y-4">
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>{t("student.rejectedTitle")}</AlertTitle>
        <AlertDescription>
          {cert.rejectReason || t("student.rejectedNoReason")}
        </AlertDescription>
      </Alert>
      {cert.editionSlug && (
        <Button asChild variant="outline">
          <Link href={`/certificates/${cert.editionSlug}`}>
            {t("student.requestAgain")}
          </Link>
        </Button>
      )}
    </div>
  );
}

function RevokedContent({ cert }: { cert: CertificateForOwner }) {
  const { t } = useT();

  return (
    <div className="mt-4">
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>{t("student.revokedTitle")}</AlertTitle>
        <AlertDescription>
          {cert.revokeReason || t("student.revokedNoReason")}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ActionZone({ cert }: { cert: CertificateForOwner }) {
  const { t } = useT();

  if (cert.status === "FullySigned") {
    return <ClaimAction cert={cert} />;
  }

  if (cert.status === "Claimed") {
    return (
      <div className="mt-6 space-y-3">
        {!cert.asset && <MintingStatus cert={cert} />}
        {cert.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- content-addressed external asset, not a local/Next-optimizable image
          <img
            src={cert.imageUrl}
            alt={t("student.certImageAlt", { name: cert.studentName })}
            className="w-full rounded-lg border border-border motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200"
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
                <Download /> {t("claim.download")}
              </a>
            </Button>
          )}
          {/* Sealed PDF (Wave 3) — the route serves claimed certs only and
              builds/caches on demand; guarded here on the same Claimed status. */}
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/certificates/${cert.address}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download /> {t("me.claim.downloadPdf")}
            </a>
          </Button>
          <CopyLinkButton
            path={`/verify/${cert.address}`}
            label={t("claim.copyLink")}
          />
          {cert.asset && (
            <Button asChild variant="outline" size="sm">
              <a
                href={explorerAddressUrl(cert.asset)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink /> {t("claim.viewNft")}
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
  const { t } = useT();

  return (
    <Card className="hover-lift">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20">
            <ScrollText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{cert.editionName}</p>
            <h3 className="font-semibold">{cert.studentName}</h3>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[cert.status]}>
          {t(STATUS_LABEL_KEY[cert.status])}
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
