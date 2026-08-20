"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCards } from "@/components/admin/stat-cards";
import { EventsFeed } from "@/components/admin/events-feed";
import { EditionsTable } from "@/components/admin/editions-table";
import { CertificatesTable } from "@/components/admin/certificates-table";
import { useAdminStats } from "@/hooks/useAdminStats";
import { useT } from "@/lib/i18n";

export default function AdminPage() {
  const { data, isLoading, isError, refetch } = useAdminStats();
  const { t } = useT();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("nav.admin")}
        </h1>
        <Button asChild>
          <Link href="/admin/editions/new">{t("admin.createEdition")}</Link>
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
        <>
          <div className="mt-8">
            <StatCards stats={data?.stats} isLoading={isLoading} />
          </div>

          <div className="mt-6">
            <EventsFeed events={data?.events} isLoading={isLoading} />
          </div>
        </>
      )}

      <Tabs defaultValue="editions" className="mt-10">
        <TabsList>
          <TabsTrigger value="editions">{t("nav.editions")}</TabsTrigger>
          <TabsTrigger value="certificates">
            {t("admin.certificates")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="editions" className="mt-4">
          <EditionsTable />
        </TabsContent>
        <TabsContent value="certificates" className="mt-4">
          <CertificatesTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
