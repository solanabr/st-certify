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

export default function AdminPage() {
  const { data, isLoading, isError, refetch } = useAdminStats();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
        <Button asChild>
          <Link href="/admin/editions/new">Criar edição</Link>
        </Button>
      </div>

      {isError ? (
        <div className="mt-8">
          <Alert variant="destructive">
            <AlertTitle>Falha ao carregar estatísticas</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>Tente novamente em instantes.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refetch()}
              >
                Tentar novamente
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
          <TabsTrigger value="editions">Edições</TabsTrigger>
          <TabsTrigger value="certificates">Certificados</TabsTrigger>
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
