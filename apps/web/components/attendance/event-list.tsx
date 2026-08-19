"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAttendanceEvents,
  useEventAction,
} from "@/hooks/useAttendanceEvents";
import { useT } from "@/lib/i18n";
import type { AttendanceEventView } from "@/app/api/attendance/events/route";

function formatEventDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** Lazily renders the claim link's QR code the first time a row's dialog opens. */
function EventQrDialog({
  claimUrl,
  eventName,
}: {
  claimUrl: string;
  eventName: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) return;
    setDataUrl(null);
    setFailed(false);
    QRCode.toDataURL(claimUrl, { width: 240 })
      .then(setDataUrl)
      .catch(() => setFailed(true));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          {t("attendance.events.qr")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{eventName}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center py-2">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URI QR code, not a local/Next-optimizable asset
            <img
              src={dataUrl}
              alt={`${t("attendance.events.qr")} — ${eventName}`}
              className="size-60"
            />
          ) : failed ? (
            <p className="text-sm text-muted-foreground">
              {t("system.error.title")}
            </p>
          ) : (
            <Skeleton className="size-60" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Creator dashboard's event table (Task 14 step 3). `useEventAction` is one
 * shared mutation for the whole table — its `variables` (the last
 * `{id, action}` passed to `.mutate`) is what lets a single row disable
 * itself while pending without a per-row hook instance, and lets the rotate
 * confirm-dialog know it's specifically a rotate (not some other row's
 * pause/resume) that's in flight.
 */
export function EventList() {
  const { t, locale } = useT();
  const { data: events, isLoading, isError, refetch } = useAttendanceEvents();
  const eventAction = useEventAction();
  const [rotateTarget, setRotateTarget] = useState<AttendanceEventView | null>(
    null,
  );

  async function copyLink(url: string): Promise<void> {
    await navigator.clipboard.writeText(url);
    toast.success(t("attendance.events.copied"));
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
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm font-medium">{t("system.error.title")}</p>
        <p className="text-sm text-muted-foreground">
          {t("system.error.body")}
        </p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          {t("system.error.retry")}
        </Button>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground">
          {t("attendance.events.empty")}
        </p>
      </div>
    );
  }

  const rotatePending =
    eventAction.isPending && eventAction.variables?.id === rotateTarget?.id;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.colName")}</TableHead>
            <TableHead>{t("attendance.form.date")}</TableHead>
            <TableHead>{t("attendance.claim.title")}</TableHead>
            <TableHead>{t("admin.colStatus")}</TableHead>
            <TableHead className="text-right">
              {t("admin.colActions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => {
            const rowPending =
              eventAction.isPending && eventAction.variables?.id === event.id;
            const pendingAction = rowPending
              ? eventAction.variables?.action
              : null;

            return (
              <TableRow key={event.id}>
                <TableCell className="font-medium whitespace-normal">
                  {event.name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatEventDate(event.eventDate, locale)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {event.maxSupply !== null
                    ? t("attendance.claim.claimedOf", {
                        count: event.mintedCount,
                        max: event.maxSupply,
                      })
                    : t("attendance.claim.claimed", {
                        count: event.mintedCount,
                      })}
                </TableCell>
                <TableCell>
                  <Badge variant={event.claimOpen ? "default" : "secondary"}>
                    {event.claimOpen
                      ? t("attendance.events.open")
                      : t("attendance.events.paused")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void copyLink(event.claimUrl)}
                    >
                      {t("attendance.events.copyLink")}
                    </Button>
                    <EventQrDialog
                      claimUrl={event.claimUrl}
                      eventName={event.name}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rowPending}
                      aria-busy={
                        pendingAction === "pause" || pendingAction === "resume"
                      }
                      onClick={() =>
                        eventAction.mutate({
                          id: event.id,
                          action: event.claimOpen ? "pause" : "resume",
                        })
                      }
                    >
                      {(pendingAction === "pause" ||
                        pendingAction === "resume") && (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      )}
                      {event.claimOpen
                        ? t("attendance.events.pause")
                        : t("attendance.events.resume")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rowPending}
                      onClick={() => setRotateTarget(event)}
                    >
                      {t("attendance.events.rotate")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog
        open={rotateTarget !== null}
        onOpenChange={(next) => {
          if (!next && !rotatePending) setRotateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("attendance.events.rotateConfirmTitle", {
                name: rotateTarget?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("attendance.events.rotateConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotatePending}>
              {t("admin.cancel")}
            </AlertDialogCancel>
            <Button
              disabled={rotatePending}
              aria-busy={rotatePending}
              onClick={() => {
                if (!rotateTarget) return;
                eventAction.mutate(
                  { id: rotateTarget.id, action: "rotate" },
                  { onSuccess: () => setRotateTarget(null) },
                );
              }}
            >
              {rotatePending && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}
              {t("attendance.events.rotate")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
