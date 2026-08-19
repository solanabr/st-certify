"use client";

import { CreatorSignin } from "@/components/attendance/creator-signin";
import { EventForm } from "@/components/attendance/event-form";
import { EventList } from "@/components/attendance/event-list";
import { useAttendanceEvents } from "@/hooks/useAttendanceEvents";
import { toAppError, type AppErrorCode } from "@/lib/errors";
import { useT } from "@/lib/i18n";

const CREATOR_GATE_CODES: ReadonlySet<AppErrorCode> = new Set([
  "ATTENDANCE_NOT_CREATOR",
  "UNAUTHORIZED",
]);

/**
 * `/events` client shell. `useAttendanceEvents` is called here purely to
 * read the query's error code and hand `refetch` to `CreatorSignin` —
 * `EventList` below calls the same hook independently and shares the cached
 * result (identical query key), so gating doesn't cost a second round-trip.
 */
export function EventsDashboard() {
  const { t } = useT();
  const { isError, error, refetch } = useAttendanceEvents();

  if (isError && CREATOR_GATE_CODES.has(toAppError(error).code)) {
    return <CreatorSignin onSignedIn={() => void refetch()} />;
  }

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

      <div className="mt-8">
        <EventList />
      </div>
    </div>
  );
}
