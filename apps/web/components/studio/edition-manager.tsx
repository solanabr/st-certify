"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Award,
  CalendarCheck,
  FileWarning,
  Inbox,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/landing/reveal";
// Separator retired here in favour of the landing's decorative .rule-gradient.
import { CertPipelineTable } from "@/components/studio/cert-pipeline-table";
import { DistributionKit } from "@/components/studio/distribution-kit";
import { EditionControls } from "@/components/studio/edition-controls";
import { SeatList } from "@/components/studio/seat-list";
import { useStudioEdition } from "@/components/studio/use-studio-edition";
import { useT, type TranslationKey } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";
import type { EditionStatusValue } from "@/lib/db/types";

/** Emerald→yellow icon chip — the studio echo of the landing's ICON_CHIP.
 * STAT_CHIP anchors summary tiles; SECTION_CHIP is the tighter inline mark
 * beside a section heading. Decorative only (matches the landing vocabulary). */
const STAT_CHIP =
  "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20";
const SECTION_CHIP =
  "flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20";

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

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={STAT_CHIP}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">
          {value}
        </dd>
      </div>
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
        <span className={STAT_CHIP}>
          <FileWarning className="size-5" aria-hidden="true" />
        </span>
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
        <p className="stbr-eyebrow mt-2">{t("admin.manage.eyebrow")}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
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

      <div className="elevate flex flex-col gap-5 rounded-2xl bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <dl className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            icon={Award}
            label={t("admin.manage.supplyLabel")}
            value={supplyLabel}
          />
          <StatTile
            icon={Inbox}
            label={t("admin.manage.requestedLabel")}
            value={String(edition.requested)}
          />
          <StatTile
            icon={CalendarCheck}
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

      <div className="rule-gradient" aria-hidden="true" />
      <Reveal>
        <SeatList edition={edition} />
      </Reveal>

      <div className="rule-gradient" aria-hidden="true" />
      <Reveal>
        <DistributionKit edition={edition} />
      </Reveal>

      <div className="rule-gradient" aria-hidden="true" />
      <Reveal>
        <section aria-labelledby="studio-pipeline-heading">
          <h2
            id="studio-pipeline-heading"
            className="flex items-center gap-2.5 text-lg font-semibold"
          >
            <span className={SECTION_CHIP}>
              <ListChecks className="size-5" aria-hidden="true" />
            </span>
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
      </Reveal>
    </div>
  );
}
