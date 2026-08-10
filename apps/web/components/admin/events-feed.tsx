import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminEvent } from "@/app/api/admin/stats/route";

const EVENT_LABEL: Record<string, string> = {
  edition_created: "Edição criada",
  edition_status_changed: "Status da edição alterado",
  certificate_requested: "Certificado solicitado",
  certificate_signed: "Certificado assinado",
  certificate_claimed: "Certificado resgatado",
  certificate_rejected: "Certificado rejeitado",
  certificate_revoked: "Certificado revogado",
};

function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type;
}

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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Atividade recente</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-5/6" />
          </div>
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum evento registrado ainda.
          </p>
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
