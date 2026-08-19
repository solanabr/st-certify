"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RevokeCell } from "@/components/admin/revoke-dialog";
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
import { useT, type TranslationKey } from "@/lib/i18n";
import type { CertificateStatusValue } from "@/lib/db/types";

const STATUS_LABEL_KEY: Record<CertificateStatusValue, TranslationKey> = {
  Requested: "admin.certStatus.requested",
  FullySigned: "admin.certStatus.fullySigned",
  Claimed: "admin.certStatus.claimed",
  Revoked: "admin.certStatus.revoked",
  Rejected: "admin.certStatus.rejected",
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
  const { t } = useT();

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
            <SelectValue placeholder={t("admin.allEditions")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.allEditions")}</SelectItem>
            {editions?.map((e) => (
              <SelectItem key={e.address} value={e.address}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t("admin.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.allStatuses")}</SelectItem>
            {(Object.keys(STATUS_LABEL_KEY) as CertificateStatusValue[]).map(
              (s) => (
                <SelectItem key={s} value={s}>
                  {t(STATUS_LABEL_KEY[s])}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Input
          placeholder={t("admin.searchByName")}
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          className="sm:max-w-xs"
          aria-label={t("admin.searchByNameAria")}
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
            {t("admin.certificatesError")}
          </p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            {t("admin.retry")}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border p-6">
          <p className="text-sm text-muted-foreground">
            {t("admin.noCertificates")}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.colStudent")}</TableHead>
              <TableHead>{t("admin.colEdition")}</TableHead>
              <TableHead>{t("admin.colStatus")}</TableHead>
              <TableHead>{t("admin.colNumber")}</TableHead>
              <TableHead className="text-right">
                {t("admin.colActions")}
              </TableHead>
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
                    {t(STATUS_LABEL_KEY[cert.status])}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {cert.certNumber ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
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
                    {cert.status === "Revoked" && (
                      <span className="px-2 text-xs text-muted-foreground">
                        {t("admin.certStatus.revoked")}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
