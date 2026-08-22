"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CapacityMeter } from "@/components/attendance/capacity-meter";
import { CreatorSignin } from "@/components/attendance/creator-signin";
import { EventForm } from "@/components/attendance/event-form";
import { EventList } from "@/components/attendance/event-list";
import { useAttendanceEvents } from "@/hooks/useAttendanceEvents";
import { ATTENDANCE_TREE_CAPACITY } from "@/lib/attendance/constants";
import { toAppError, type AppErrorCode } from "@/lib/errors";
import { useT } from "@/lib/i18n";

const CREATOR_GATE_CODES: ReadonlySet<AppErrorCode> = new Set([
  "ATTENDANCE_NOT_CREATOR",
  "UNAUTHORIZED",
]);

/**
 * `/events` client shell. `useAttendanceEvents` is called here and shared with
 * `EventList` (identical query key, one round-trip). Creator status is only
 * confirmed once that query succeeds, so the dashboard chrome — including the
 * working "Novo evento" button — is gated behind the query rather than shown
 * optimistically and retracted (five-3): an unauthenticated visitor sees the
 * loading state, then the sign-in, never a usable dashboard.
 */
export function EventsDashboard() {
  const { t, locale } = useT();
  const {
    data: events,
    isPending,
    isError,
    error,
    refetch,
  } = useAttendanceEvents();

  if (isPending) {
    return (
      <div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("attendance.events.title")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t("attendance.events.subtitle")}
          </p>
        </div>
        <div className="mt-8 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    if (CREATOR_GATE_CODES.has(toAppError(error).code)) {
      return <CreatorSignin onSignedIn={() => void refetch()} />;
    }
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
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

  // Tree usage across every event, from the already-cached list (no new fetch).
  const totalMinted = events.reduce((sum, event) => sum + event.mintedCount, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("attendance.events.title")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t("attendance.events.subtitle")}
          </p>
        </div>
        <EventForm />
      </div>

      {events.length > 0 && (
        <CapacityMeter
          value={totalMinted}
          max={ATTENDANCE_TREE_CAPACITY}
          label={t("attendance.events.capacity")}
          locale={locale}
          className="mt-6 max-w-md"
        />
      )}

      <div className="mt-8">
        <EventList />
      </div>
    </div>
  );
}
