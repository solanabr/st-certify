"use client";

import { Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventClaims } from "@/hooks/useAttendanceEvents";
import { explorerAddressUrl } from "@/lib/chain/explorer-url";
import { downloadCsv, toCsv } from "@/lib/csv";
import { useT, type TranslationKey } from "@/lib/i18n";
import type { AttendanceClaimListRow } from "@/lib/db/attendance-queries";
import type { AttendanceClaimStatus } from "@/lib/db/types";

const STATUS_LABEL: Record<AttendanceClaimStatus, TranslationKey> = {
  pending: "attendance.claim.statusPending",
  minted: "attendance.claim.statusMinted",
  failed: "attendance.claim.statusFailed",
};

const STATUS_VARIANT: Record<
  AttendanceClaimStatus,
  "default" | "secondary" | "destructive"
> = {
  pending: "secondary",
  minted: "default",
  failed: "destructive",
};

function truncateMiddle(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function formatClaimedAt(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * Creator's attendee list for one event (P1-4), in a right-side Sheet. Opens
 * when `event` is non-null; the claims fetch is keyed on the event id and only
 * runs while open (see `useEventClaims`). The CSV export serializes the
 * already-fetched rows client-side — no extra route. Renders all five async
 * states: loading (skeleton), error (retry), empty (next action), and the
 * populated list; "pending" claims appear inline as a status badge.
 */
export function AttendeeDrawer({
  event,
  onOpenChange,
}: {
  event: { id: string; name: string; claimUrl: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useT();
  const claims = useEventClaims(event?.id ?? null);
  const rows = claims.data;

  async function copyLink(url: string): Promise<void> {
    await navigator.clipboard.writeText(url);
    toast.success(t("attendance.events.copied"));
  }

  function handleExport(): void {
    if (!event || !rows || rows.length === 0) return;
    const headers = [
      t("attendance.drawer.wallet"),
      t("admin.colStatus"),
      t("attendance.drawer.claimedAt"),
      t("attendance.drawer.asset"),
    ];
    const body = rows.map((row: AttendanceClaimListRow) => [
      row.wallet,
      t(STATUS_LABEL[row.status]),
      new Date(row.claimedAt).toISOString(),
      row.assetId ?? "",
    ]);
    const safeName = event.name.replace(/[^\p{L}\p{N}._-]+/gu, "_");
    downloadCsv(`${safeName}-attendees.csv`, toCsv(headers, body));
  }

  return (
    <Sheet open={event !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("attendance.events.attendees")}</SheetTitle>
          <SheetDescription>{event?.name}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 p-4">
          {claims.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-md" />
              <Skeleton className="h-14 w-full rounded-md" />
              <Skeleton className="h-14 w-full rounded-md" />
            </div>
          ) : claims.isError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm font-medium">{t("system.error.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("system.error.body")}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void claims.refetch()}
              >
                {t("system.error.retry")}
              </Button>
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="space-y-3 rounded-lg border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t("attendance.drawer.empty")}
              </p>
              {event && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copyLink(event.claimUrl)}
                >
                  {t("attendance.events.copyLink")}
                </Button>
              )}
            </div>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="self-end"
                onClick={handleExport}
              >
                <Download aria-hidden="true" />
                {t("attendance.drawer.csv")}
              </Button>

              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <li
                    key={row.wallet}
                    className="flex flex-col gap-1.5 rounded-md border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="font-medium tabular-nums"
                        title={row.wallet}
                      >
                        {truncateMiddle(row.wallet)}
                      </span>
                      <Badge variant={STATUS_VARIANT[row.status]}>
                        {t(STATUS_LABEL[row.status])}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span className="tabular-nums">
                        {formatClaimedAt(row.claimedAt, locale)}
                      </span>
                      {row.assetId && (
                        <a
                          href={explorerAddressUrl(row.assetId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          {t("attendance.drawer.viewAsset")}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
