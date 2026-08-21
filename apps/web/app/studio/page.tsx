"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatCards } from "@/components/admin/stat-cards";
import { EventsFeed } from "@/components/admin/events-feed";
import { EditionsTable } from "@/components/admin/editions-table";
import { useAdminStats } from "@/hooks/useAdminStats";
import { useT } from "@/lib/i18n";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("admin.title")}
        </h1>
        <Button asChild>
          <Link href="/studio/editions/new">{t("admin.createEdition")}</Link>
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

      <section aria-labelledby="studio-editions-heading" className="mt-10">
        <h2
          id="studio-editions-heading"
          className="text-lg font-semibold tracking-tight"
        >
          {t("admin.editions")}
        </h2>
        <div className="mt-4">
          <EditionsTable />
        </div>
      </section>

      <div className="mt-10">
        <EventsFeed events={data?.events} isLoading={isLoading} />
      </div>
    </div>
  );
}
