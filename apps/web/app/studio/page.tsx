"use client";

import Link from "next/link";
import { Layers, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";
import { StatCards } from "@/components/admin/stat-cards";
import { EventsFeed } from "@/components/admin/events-feed";
import { EditionsTable } from "@/components/admin/editions-table";
import { useAdminStats } from "@/hooks/useAdminStats";
import { useT } from "@/lib/i18n";

/** Decorative section-heading chip — same emerald→yellow mark as the landing. */
const SECTION_CHIP =
  "flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20";

/**
 * Thin dashboard: how things stand, which editions exist, and what happened
 * lately. Everything you can *do* to an edition lives one click away on its
 * management page — the flat studio-wide certificates table is gone, since a
 * revoke button is only safe next to a row when you already know which
 * edition you are in.
 */
export default function StudioPage() {
  const { data, isLoading, isError, refetch } = useAdminStats();
  const { t } = useT();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="stbr-eyebrow">{t("admin.eyebrow")}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("admin.title")}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {t("admin.subtitle")}
          </p>
        </div>
        <Button asChild>
          <Link href="/studio/editions/new">
            <Plus aria-hidden="true" />
            {t("admin.createEdition")}
          </Link>
        </Button>
      </div>

      {isError ? (
        <div className="mt-8">
          <Alert variant="destructive">
            <AlertTitle>{t("admin.statsError")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{t("admin.statsErrorHint")}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refetch()}
              >
                {t("admin.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <div className="mt-8">
          <StatCards stats={data?.stats} isLoading={isLoading} />
        </div>
      )}

      <Reveal className="mt-10">
        <section aria-labelledby="studio-editions-heading">
          <h2
            id="studio-editions-heading"
            className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"
          >
            <span className={SECTION_CHIP}>
              <Layers className="size-5" aria-hidden="true" />
            </span>
            {t("admin.editions")}
          </h2>
          <div className="mt-4">
            <EditionsTable />
          </div>
        </section>
      </Reveal>

      <Reveal className="mt-10">
        <EventsFeed events={data?.events} isLoading={isLoading} />
      </Reveal>
    </div>
  );
}
