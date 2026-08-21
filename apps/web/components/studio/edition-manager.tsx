"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CertPipelineTable } from "@/components/studio/cert-pipeline-table";
import { DistributionKit } from "@/components/studio/distribution-kit";
import { EditionControls } from "@/components/studio/edition-controls";
import { SeatList } from "@/components/studio/seat-list";
import { useStudioEdition } from "@/components/studio/use-studio-edition";
import { useT, type TranslationKey } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";
import type { EditionStatusValue } from "@/lib/db/types";

const STATUS_LABEL_KEY: Record<EditionStatusValue, TranslationKey> = {
  Open: "admin.editionStatus.open",
  Paused: "admin.editionStatus.paused",
  Closed: "admin.editionStatus.closed",
};

const STATUS_VARIANT: Record<
  EditionStatusValue,
  "default" | "secondary" | "outline"
> = {
  Open: "default",
  Paused: "secondary",
  Closed: "outline",
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function BackLink() {
  const { t } = useT();
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href="/studio">
        <ArrowLeft aria-hidden="true" />
        {t("admin.manage.backToStudio")}
      </Link>
    </Button>
  );
}

/**
 * One page per edition, whether it exists on-chain or is still a draft.
 * `useStudioEdition` resolves `[id]` from either side; everything below reads
 * the same view model, so a pre-overhaul edition (no draft row, signers
 * already on-chain) renders the same page in management-only mode rather than
 * a separate legacy screen.
 */
export function EditionManager({ id }: { id: string }) {
  const { t, locale } = useT();
  const {
    data: edition,
    isPending,
    isError,
    notFound,
    refetch,
  } = useStudioEdition(id);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (notFound || (!edition && !isError)) {
    return (
      <div className="flex flex-col items-start gap-3">
        <BackLink />
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("admin.manage.notFoundTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.manage.notFoundBody")}
        </p>
      </div>
    );
  }

  if (isError || !edition) {
    return (
      <div className="flex flex-col items-start gap-3">
        <BackLink />
        <p className="text-sm text-muted-foreground">
          {t("admin.editionsError")}
        </p>
        <Button size="sm" variant="outline" onClick={refetch}>
          {t("admin.retry")}
        </Button>
      </div>
    );
  }

  const supplyLabel =
    edition.maxSupply === null
      ? t("admin.manage.supplyUnlimited", { minted: edition.minted })
      : t("admin.manage.supply", {
          minted: edition.minted,
          max: edition.maxSupply,
        });

  return (
    <div className="space-y-8">
      <div>
        <BackLink />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {edition.name || t("admin.manage.untitled")}
          </h1>
          {edition.status ? (
            <Badge variant={STATUS_VARIANT[edition.status]}>
              {t(STATUS_LABEL_KEY[edition.status])}
            </Badge>
          ) : (
            <Badge variant="outline">{t("admin.manage.draftBadge")}</Badge>
          )}
        </div>
        {edition.description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {edition.description}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-end sm:justify-between">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact label={t("admin.manage.supplyLabel")} value={supplyLabel} />
          <Fact
            label={t("admin.manage.requestedLabel")}
            value={String(edition.requested)}
          />
          <Fact
            label={t("admin.meta.completionDateLabel")}
            value={
              edition.completionDate
                ? formatDate(edition.completionDate, locale)
                : "—"
            }
          />
        </dl>
        <EditionControls edition={edition} />
      </div>

      <Separator />
      <SeatList edition={edition} />

      <Separator />
      <DistributionKit edition={edition} />

      <Separator />
      <section aria-labelledby="studio-pipeline-heading">
        <h2 id="studio-pipeline-heading" className="text-lg font-semibold">
          {t("admin.manage.pipeline.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.manage.pipeline.intro")}
        </p>
        {edition.chainAddress ? (
          <CertPipelineTable
            editionAddress={edition.chainAddress}
            signerCount={edition.seats.length}
          />
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-border p-6">
            <p className="text-sm text-muted-foreground">
              {t("admin.manage.pipeline.draftNote")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
