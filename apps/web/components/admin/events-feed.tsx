"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT, type TranslationKey } from "@/lib/i18n";
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

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function EventsFeed({
  events,
  isLoading,
}: {
  events: AdminEvent[] | undefined;
  isLoading: boolean;
}) {
  const { t } = useT();

  function eventLabel(type: string): string {
    const key = EVENT_LABEL_KEY[type];
    return key ? t(key) : type;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.recentActivity")}</CardTitle>
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
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <span>{eventLabel(event.type)}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatTimestamp(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
