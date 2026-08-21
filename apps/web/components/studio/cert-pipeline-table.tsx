"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RevokeCell } from "@/components/admin/revoke-dialog";
import {
  pipelineState,
  type PipelineStage,
} from "@/components/studio/pipeline-state";
import { useAdminCertificates } from "@/hooks/useAdminCertificates";
import { useT, type TranslationKey } from "@/lib/i18n";
import type { CertificateAdminRow } from "@/lib/db/types";

const STAGE_LABEL_KEY: Record<PipelineStage, TranslationKey> = {
  requested: "admin.manage.pipeline.stage.requested",
  signing: "admin.manage.pipeline.stage.signing",
  ready: "admin.manage.pipeline.stage.ready",
  issued: "admin.manage.pipeline.stage.issued",
  rejected: "admin.manage.pipeline.stage.rejected",
  revoked: "admin.manage.pipeline.stage.revoked",
};

const STAGE_VARIANT: Record<
  PipelineStage,
  "default" | "secondary" | "destructive" | "outline"
> = {
  requested: "secondary",
  signing: "secondary",
  ready: "default",
  issued: "default",
  rejected: "outline",
  revoked: "destructive",
};

/** Stage badge plus the m/n counter, which only means anything mid-pipeline. */
function StageCell({
  cert,
  signerCount,
}: {
  cert: CertificateAdminRow;
  signerCount: number;
}) {
  const { t } = useT();
  const state = pipelineState({
    status: cert.status,
    signerBitmap: cert.signerBitmap,
    signerCount,
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={STAGE_VARIANT[state.stage]}>
        {t(STAGE_LABEL_KEY[state.stage])}
      </Badge>
      {(state.stage === "requested" || state.stage === "signing") && (
        <span className="tabular-nums text-xs text-muted-foreground">
          {t("admin.manage.pipeline.signatures", {
            signed: state.signed,
            total: state.total,
          })}
        </span>
      )}
    </div>
  );
}

/** Shared by the table rows and the mobile cards so neither drifts. */
function RowActions({ cert }: { cert: CertificateAdminRow }) {
  const { t } = useT();

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button asChild size="sm" variant="ghost">
        <Link
          href={`/verify/${cert.address}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("verify.check")}
        </Link>
      </Button>
      {cert.status === "Claimed" && (
        <RevokeCell
          certificateAddress={cert.address}
          studentName={cert.studentName}
        />
      )}
    </div>
  );
}

/**
 * Per-edition certificate pipeline — the flat studio-wide certificates table
 * collapsed to one edition, which is what makes the revoke action safe to sit
 * next to a row (you are already scoped to the edition you opened).
 *
 * Rejection stays where it is: only a signer can reject, and they do it from
 * the signing queue with a reason. This table reports the outcome.
 */
export function CertPipelineTable({
  editionAddress,
  signerCount,
}: {
  editionAddress: string;
  signerCount: number;
}) {
  const { t } = useT();
  const {
    data: certs,
    isPending,
    isError,
    refetch,
  } = useAdminCertificates({ edition: editionAddress });

  if (isPending) {
    return (
      <div className="mt-4 space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-border p-6">
        <p className="text-sm text-muted-foreground">
          {t("admin.certificatesError")}
        </p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          {t("admin.retry")}
        </Button>
      </div>
    );
  }

  if (certs.length === 0) {
    return (
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20">
          <Inbox className="size-5" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          {t("admin.manage.pipeline.empty")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.colStudent")}</TableHead>
              <TableHead>{t("admin.manage.pipeline.colStage")}</TableHead>
              <TableHead>{t("admin.colNumber")}</TableHead>
              <TableHead className="text-right">
                {t("admin.colActions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {certs.map((cert) => (
              <TableRow key={cert.address}>
                <TableCell className="font-medium whitespace-normal">
                  {cert.studentName}
                </TableCell>
                <TableCell>
                  <StageCell cert={cert} signerCount={signerCount} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {cert.certNumber ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <RowActions cert={cert} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:hidden">
        {certs.map((cert) => (
          <Card key={cert.address}>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{cert.studentName}</p>
                {cert.certNumber !== null && (
                  <span className="tabular-nums text-sm text-muted-foreground">
                    #{cert.certNumber}
                  </span>
                )}
              </div>
              <StageCell cert={cert} signerCount={signerCount} />
              <RowActions cert={cert} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
