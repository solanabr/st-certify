"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminEditions } from "@/hooks/useAdminEditions";
import { useSetEditionStatus } from "@/hooks/useSetEditionStatus";
import { onAppError } from "@/lib/on-app-error";
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

export function EditionsTable() {
  const { data: editions, isLoading, isError, refetch } = useAdminEditions();
  const setStatus = useSetEditionStatus();
  const { t, locale } = useT();

  async function copyLink(slug: string): Promise<void> {
    const url = `${window.location.origin}/editions/${slug}`;
    // Denied clipboard permission and non-secure origins both reject here;
    // surface the URL so the admin can still copy it by hand.
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("claim.copied"));
    } catch {
      toast.error(t("admin.copyLinkFailed"), { description: url });
    }
  }

  function toggleStatus(address: string, current: EditionStatusValue): void {
    const next = current === "Open" ? "Paused" : "Open";
    setStatus.mutate(
      { address, status: next },
      { onError: (err) => onAppError(err) },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
        <p className="text-sm text-muted-foreground">
          {t("admin.editionsError")}
        </p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          {t("admin.retry")}
        </Button>
      </div>
    );
  }

  if (!editions || editions.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
        <p className="text-sm text-muted-foreground">{t("admin.noEditions")}</p>
        <Button asChild size="sm">
          <Link href="/admin/editions/new">{t("admin.createEdition")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("admin.colName")}</TableHead>
          <TableHead>{t("admin.colStatus")}</TableHead>
          <TableHead>{t("admin.certificates")}</TableHead>
          <TableHead>{t("admin.colCreatedAt")}</TableHead>
          <TableHead className="text-right">{t("admin.colActions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {editions.map((edition) => (
          <TableRow key={edition.address}>
            <TableCell className="font-medium whitespace-normal">
              {edition.name}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[edition.status]}>
                {t(STATUS_LABEL_KEY[edition.status])}
              </Badge>
            </TableCell>
            <TableCell className="tabular-nums">
              {edition.minted}/{edition.maxSupply}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(edition.createdAt, locale)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                {edition.status !== "Closed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={setStatus.isPending}
                    onClick={() =>
                      toggleStatus(edition.address, edition.status)
                    }
                  >
                    {edition.status === "Open"
                      ? t("admin.pause")
                      : t("admin.open")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void copyLink(edition.slug)}
                >
                  {t("admin.copyLink")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled
                  aria-disabled="true"
                  title={t("admin.editDisabledTitle")}
                >
                  {t("admin.edit")}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
