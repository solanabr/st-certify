"use client";

import {
  Activity,
  BadgeCheck,
  Ban,
  Circle,
  FilePlus2,
  FileText,
  PenLine,
  Settings2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT, type TranslationKey } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";
import type { AdminEvent } from "@/app/api/admin/stats/route";

const EVENT_LABEL_KEY: Record<string, TranslationKey> = {
  edition_created: "admin.event.editionCreated",
  edition_status_changed: "admin.event.editionStatusChanged",
  certificate_requested: "admin.event.certificateRequested",
  certificate_signed: "admin.event.certificateSigned",
  certificate_claimed: "admin.event.certificateClaimed",
  certificate_rejected: "admin.event.certificateRejected",
  certificate_revoked: "admin.event.certificateRevoked",
};

/** A quiet glyph per event type — scannability without color-coding the feed. */
const EVENT_ICON: Record<string, LucideIcon> = {
  edition_created: FilePlus2,
  edition_status_changed: Settings2,
  certificate_requested: FileText,
  certificate_signed: PenLine,
  certificate_claimed: BadgeCheck,
  certificate_rejected: X,
  certificate_revoked: Ban,
};

const HEADER_CHIP =
  "flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20";

export function EventsFeed({
  events,
  isLoading,
}: {
  events: AdminEvent[] | undefined;
  isLoading: boolean;
}) {
  const { t, locale } = useT();

  function eventLabel(type: string): string {
    const key = EVENT_LABEL_KEY[type];
    return key ? t(key) : type;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className={HEADER_CHIP}>
            <Activity className="size-5" aria-hidden="true" />
          </span>
          {t("admin.recentActivity")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-5/6" />
          </div>
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noEvents")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((event) => {
              const Icon = EVENT_ICON[event.type] ?? Circle;
              return (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="truncate">{eventLabel(event.type)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatDate(event.createdAt, locale, "dateTime")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
