"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminCertificates } from "@/hooks/useAdminCertificates";
import { useAdminEditions } from "@/hooks/useAdminEditions";
import type { CertificateStatusValue } from "@/lib/db/types";

const STATUS_LABEL: Record<CertificateStatusValue, string> = {
  Requested: "Solicitado",
  FullySigned: "Pronto",
  Claimed: "Resgatado",
  Revoked: "Revogado",
  Rejected: "Rejeitado",
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

export function CertificatesTable() {
  const [editionFilter, setEditionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [nameQuery, setNameQuery] = useState("");

  const { data: editions } = useAdminEditions();
  const {
    data: certs,
    isLoading,
    isError,
    refetch,
  } = useAdminCertificates({
    edition: editionFilter === "all" ? undefined : editionFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const filtered = useMemo(() => {
    if (!certs) return [];
    const q = nameQuery.trim().toLowerCase();
    if (!q) return certs;
    return certs.filter((c) => c.studentName.toLowerCase().includes(q));
  }, [certs, nameQuery]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={editionFilter} onValueChange={setEditionFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Todas as edições" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as edições</SelectItem>
            {editions?.map((e) => (
              <SelectItem key={e.address} value={e.address}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {(Object.keys(STATUS_LABEL) as CertificateStatusValue[]).map(
              (s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Input
          placeholder="Buscar por nome"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          className="sm:max-w-xs"
          aria-label="Buscar certificado por nome do aluno"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
          <p className="text-sm text-muted-foreground">
            Falha ao carregar certificados.
          </p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border p-6">
          <p className="text-sm text-muted-foreground">
            Nenhum certificado encontrado.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>Edição</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Nº</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((cert) => (
              <TableRow key={cert.address}>
                <TableCell className="font-medium">
                  {cert.studentName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {cert.editionName}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[cert.status]}>
                    {STATUS_LABEL[cert.status]}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {cert.certNumber ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled
                    aria-disabled="true"
                    title="Revogação chega no M5"
                    className="text-destructive"
                  >
                    Revogar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
