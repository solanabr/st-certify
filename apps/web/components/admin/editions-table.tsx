"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
import { useAdminEditions } from "@/hooks/useAdminEditions";
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

function supplyLabel(minted: number, maxSupply: number): string {
  return maxSupply > 0 ? `${minted}/${maxSupply}` : String(minted);
}

/**
 * The dashboard's edition list. Purely navigational since the overhaul —
 * pause/open, the distribution kit and the per-certificate pipeline all live
 * on the management page a row opens, so there is exactly one place each
 * action exists. Table at `sm+`, cards below.
 */
export function EditionsTable() {
  const { data: editions, isPending, isError, refetch } = useAdminEditions();
  const { t, locale } = useT();

  if (isPending) {
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

  if (editions.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
        <p className="text-sm text-muted-foreground">{t("admin.noEditions")}</p>
        <Button asChild size="sm">
          <Link href="/studio/editions/new">{t("admin.createEdition")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.colName")}</TableHead>
              <TableHead>{t("admin.colStatus")}</TableHead>
              <TableHead>{t("admin.certificates")}</TableHead>
              <TableHead>{t("admin.colCreatedAt")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {editions.map((edition) => (
              <TableRow key={edition.address}>
                <TableCell className="font-medium whitespace-normal">
                  <Link
                    href={`/studio/editions/${edition.address}`}
                    className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {edition.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[edition.status]}>
                    {t(STATUS_LABEL_KEY[edition.status])}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {supplyLabel(edition.minted, edition.maxSupply)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(edition.createdAt, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:hidden">
        {editions.map((edition) => (
          <Card key={edition.address}>
            <CardContent>
              <Link
                href={`/studio/editions/${edition.address}`}
                className="flex items-center justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{edition.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground tabular-nums">
                    {supplyLabel(edition.minted, edition.maxSupply)} ·{" "}
                    {formatDate(edition.createdAt, locale)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant={STATUS_VARIANT[edition.status]}>
                    {t(STATUS_LABEL_KEY[edition.status])}
                  </Badge>
                  <ChevronRight
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
