"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSeatRemind } from "@/components/studio/use-seat-remind";
import { useT, type TranslationKey } from "@/lib/i18n";
import type {
  StudioEditionView,
  StudioSeat,
  StudioSeatStatus,
} from "@/components/studio/use-studio-edition";

const STATUS_LABEL_KEY: Record<StudioSeatStatus, TranslationKey> = {
  invited: "admin.manage.seats.status.invited",
  accepted: "admin.manage.seats.status.accepted",
  expired: "admin.manage.seats.status.expired",
};

const STATUS_VARIANT: Record<
  StudioSeatStatus,
  "default" | "secondary" | "outline"
> = {
  invited: "secondary",
  accepted: "default",
  expired: "outline",
};

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Email while the seat is an invite, wallet once it is bound — never both, never neither. */
function SeatContact({ seat }: { seat: StudioSeat }) {
  if (seat.email) {
    return <span className="break-all">{seat.email}</span>;
  }
  if (seat.wallet) {
    return (
      <span className="font-mono text-xs" title={seat.wallet}>
        {truncateAddress(seat.wallet)}
      </span>
    );
  }
  return <span aria-hidden="true">—</span>;
}

/**
 * Re-send is offered only for a seat still waiting on its invite. An accepted
 * seat has nothing to chase, and an on-chain roster has no invite row at all —
 * which is why the caller passes `remind` as null in management-only mode
 * rather than this component deciding to render a button that would 404.
 */
function SeatAction({
  seat,
  remind,
}: {
  seat: StudioSeat;
  remind: ReturnType<typeof useSeatRemind> | null;
}) {
  const { t } = useT();

  if (!remind || seat.status === "accepted") {
    return null;
  }

  const pending = remind.isPending && remind.variables === seat.id;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={remind.isPending}
      aria-busy={pending}
      onClick={() => remind.mutate(seat.id)}
    >
      {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
      {pending
        ? t("admin.manage.seats.resending")
        : t("admin.manage.seats.resend")}
    </Button>
  );
}

/**
 * Seat roster with invite status. Table at `sm+`, cards below, so the status
 * and the re-send button stay reachable on a phone (the EventList pattern).
 */
export function SeatList({ edition }: { edition: StudioEditionView }) {
  const { t } = useT();
  // Hooks cannot be conditional, so this is always constructed; `remind` below
  // is what gates it to drafts, where an invite row actually exists.
  const remindMutation = useSeatRemind(edition.id);
  const remind = edition.seatsFromChain ? null : remindMutation;

  return (
    <section aria-labelledby="studio-seats-heading">
      <h2 id="studio-seats-heading" className="text-lg font-semibold">
        {t("admin.manage.seats.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {edition.seatsFromChain
          ? t("admin.manage.seats.onChainNote")
          : t("admin.manage.seats.intro")}
      </p>

      {edition.seats.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6">
          <p className="text-sm text-muted-foreground">
            {t("admin.manage.seats.empty")}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.manage.seats.colSigner")}</TableHead>
                  <TableHead>{t("admin.manage.seats.colContact")}</TableHead>
                  <TableHead>{t("admin.colStatus")}</TableHead>
                  <TableHead className="text-right">
                    {t("admin.colActions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {edition.seats.map((seat) => (
                  <TableRow key={seat.id}>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{seat.name}</span>
                      {seat.role && (
                        <span className="block text-sm text-muted-foreground">
                          {seat.role}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <SeatContact seat={seat} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[seat.status]}>
                        {t(STATUS_LABEL_KEY[seat.status])}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <SeatAction seat={seat} remind={remind} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:hidden">
            {edition.seats.map((seat) => (
              <Card key={seat.id}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{seat.name}</p>
                      {seat.role && (
                        <p className="text-sm text-muted-foreground">
                          {seat.role}
                        </p>
                      )}
                    </div>
                    <Badge variant={STATUS_VARIANT[seat.status]}>
                      {t(STATUS_LABEL_KEY[seat.status])}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <SeatContact seat={seat} />
                  </p>
                  <SeatAction seat={seat} remind={remind} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
