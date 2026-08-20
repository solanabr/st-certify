"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { AttendeeDrawer } from "@/components/attendance/attendee-drawer";
import { CapacityMeter } from "@/components/attendance/capacity-meter";
import {
  useAttendanceEvents,
  useEventAction,
} from "@/hooks/useAttendanceEvents";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AttendanceEventView } from "@/app/api/attendance/events/route";

function formatEventDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function truncateMiddle(value: string, head = 22, tail = 10): string {
  return value.length <= head + tail + 1
    ? value
    : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * Lazily renders the claim link's QR code the first time a row's dialog opens.
 * `qrcode` is imported on demand (bundle-2) so the ~50KB encoder never ships in
 * the dashboard's initial bundle.
 */
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

  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(claimUrl);
    toast.success(t("attendance.events.copied"));
  }

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) return;
    setDataUrl(null);
    setFailed(false);
    void (async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        setDataUrl(await QRCode.toDataURL(claimUrl, { width: 512 }));
      } catch {
        setFailed(true);
      }
    })();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          {t("attendance.events.qr")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
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
        <div className="flex items-center gap-2">
          <span
            className="flex-1 truncate text-xs text-muted-foreground"
            title={claimUrl}
          >
            {truncateMiddle(claimUrl)}
          </span>
          <Button size="sm" variant="outline" onClick={() => void copyLink()}>
            {t("attendance.events.copyLink")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Minted-vs-cap display: a colored capacity meter for capped events, plain count otherwise. */
function ClaimedCell({ event }: { event: AttendanceEventView }) {
  const { t } = useT();
  if (event.maxSupply === null) {
    return (
      <span className="tabular-nums">
        {t("attendance.claim.claimed", { count: event.mintedCount })}
      </span>
    );
  }
  return (
    <CapacityMeter
      value={event.mintedCount}
      max={event.maxSupply}
      className="min-w-36"
    />
  );
}

/** The per-event action row, shared by the desktop table and the mobile cards. */
function EventRowActions({
  event,
  eventAction,
  onCopy,
  onRotate,
  onAttendees,
  className,
}: {
  event: AttendanceEventView;
  eventAction: ReturnType<typeof useEventAction>;
  onCopy: (url: string) => void;
  onRotate: (event: AttendanceEventView) => void;
  onAttendees: (event: AttendanceEventView) => void;
  className?: string;
}) {
  const { t } = useT();
  const rowPending =
    eventAction.isPending && eventAction.variables?.id === event.id;
  const pendingAction = rowPending ? eventAction.variables?.action : null;
  const pauseResumePending =
    pendingAction === "pause" || pendingAction === "resume";

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      <Button size="sm" variant="ghost" onClick={() => onCopy(event.claimUrl)}>
        {t("attendance.events.copyLink")}
      </Button>
      <EventQrDialog claimUrl={event.claimUrl} eventName={event.name} />
      <Button size="sm" variant="outline" onClick={() => onAttendees(event)}>
        {t("attendance.events.attendees")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={rowPending}
        aria-busy={pauseResumePending}
        onClick={() =>
          eventAction.mutate({
            id: event.id,
            action: event.claimOpen ? "pause" : "resume",
          })
        }
      >
        {pauseResumePending && (
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
        onClick={() => onRotate(event)}
      >
        {t("attendance.events.rotate")}
      </Button>
    </div>
  );
}

/**
 * Creator dashboard's event list. `useEventAction` is one shared mutation for
 * the whole list — its `variables` (the last `{id, action}` passed to `.mutate`)
 * is what lets a single row disable itself while pending without a per-row hook
 * instance, and lets the rotate confirm-dialog know it's specifically a rotate
 * that's in flight. Renders a Table at `sm+` and stacked Cards on phones
 * (UI-M1) so every action stays reachable on a small screen.
 */
export function EventList() {
  const { t, locale } = useT();
  const { data: events, isLoading, isError, refetch } = useAttendanceEvents();
  const eventAction = useEventAction();
  const [rotateTarget, setRotateTarget] = useState<AttendanceEventView | null>(
    null,
  );
  const [attendeeTarget, setAttendeeTarget] =
    useState<AttendanceEventView | null>(null);

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
      {/* Desktop: full table. */}
      <div className="hidden sm:block">
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
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="font-medium whitespace-normal">
                  {event.name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatEventDate(event.eventDate, locale)}
                </TableCell>
                <TableCell>
                  <ClaimedCell event={event} />
                </TableCell>
                <TableCell>
                  <Badge variant={event.claimOpen ? "default" : "secondary"}>
                    {event.claimOpen
                      ? t("attendance.events.open")
                      : t("attendance.events.paused")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <EventRowActions
                    event={event}
                    eventAction={eventAction}
                    onCopy={(url) => void copyLink(url)}
                    onRotate={setRotateTarget}
                    onAttendees={setAttendeeTarget}
                    className="justify-end"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: cards so status + every action stay on-screen (UI-M1). */}
      <div className="flex flex-col gap-3 sm:hidden">
        {events.map((event) => (
          <Card key={event.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{event.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatEventDate(event.eventDate, locale)}
                  </p>
                </div>
                <Badge variant={event.claimOpen ? "default" : "secondary"}>
                  {event.claimOpen
                    ? t("attendance.events.open")
                    : t("attendance.events.paused")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ClaimedCell event={event} />
              <EventRowActions
                event={event}
                eventAction={eventAction}
                onCopy={(url) => void copyLink(url)}
                onRotate={setRotateTarget}
                onAttendees={setAttendeeTarget}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <AttendeeDrawer
        event={attendeeTarget}
        onOpenChange={(open) => {
          if (!open) setAttendeeTarget(null);
        }}
      />

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
