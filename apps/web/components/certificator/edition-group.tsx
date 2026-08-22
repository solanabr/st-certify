"use client";

import { Check, MoreHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { callerSignerWallet } from "@/lib/db/certificator-queries";
import { useT } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";
import type { PendingEditionGroup } from "@/hooks/usePendingInbox";
import type { CertSignState } from "@/hooks/useMassSign";
import type { RejectTarget } from "./reject-dialog";

function StateBadge({ state }: { state: CertSignState | undefined }) {
  const { t } = useT();
  if (state === "signing") {
    return (
      <Badge variant="secondary" aria-live="polite">
        {t("certificator.signing")}
      </Badge>
    );
  }
  if (state === "confirmed") {
    return (
      <Badge variant="outline" className="gap-1 text-success">
        <Check className="size-3" aria-hidden="true" />
        {t("certificator.signed")}
      </Badge>
    );
  }
  if (state === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <X className="size-3" aria-hidden="true" />
        {t("certificator.failed")}
      </Badge>
    );
  }
  return null;
}

type PendingCert = PendingEditionGroup["certificates"][number];

/** Selection control for one certificate, shared by the table rows and the cards. */
function CertCheckbox({
  cert,
  checked,
  onToggle,
}: {
  cert: PendingCert;
  checked: boolean;
  onToggle: () => void;
}) {
  const { t } = useT();
  return (
    <Checkbox
      className="size-6"
      checked={checked}
      onCheckedChange={onToggle}
      aria-label={t("certificator.selectCertOf", { name: cert.studentName })}
    />
  );
}

/** Per-certificate overflow menu, shared by the table rows and the cards. */
function CertActions({
  cert,
  group,
  signerWallet,
  onReject,
}: {
  cert: PendingCert;
  group: PendingEditionGroup;
  signerWallet: RejectTarget["signerWallet"];
  onReject: (target: RejectTarget) => void;
}) {
  const { t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("certificator.actionsFor", { name: cert.studentName })}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          variant="destructive"
          onSelect={() =>
            onReject({
              certificateAddress: cert.address,
              editionAddress: group.editionAddress,
              studentName: cert.studentName,
              ownerWallet: cert.ownerWallet,
              signerWallet,
            })
          }
        >
          {t("certificator.rejectEllipsis")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One edition's pending certificates. Student name is deliberately the loudest cell. */
export function EditionGroupTable({
  group,
  selected,
  certState,
  onToggleCert,
  onToggleAll,
  onReject,
}: {
  group: PendingEditionGroup;
  selected: Set<string>;
  certState: Record<string, CertSignState>;
  onToggleCert: (certificateAddress: string) => void;
  onToggleAll: (checked: boolean) => void;
  onReject: (target: RejectTarget) => void;
}) {
  const { t, locale } = useT();
  const signerWallet = callerSignerWallet(group);
  const selectedInGroup = group.certificates.filter((c) =>
    selected.has(c.address),
  ).length;
  const allSelected =
    selectedInGroup === group.certificates.length &&
    group.certificates.length > 0;
  const someSelected = selectedInGroup > 0 && !allSelected;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Checkbox
          className="size-6"
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={(c) => onToggleAll(c === true)}
          aria-label={t("certificator.selectAllIn", {
            edition: group.editionName,
          })}
        />
        <h2 className="min-w-0 text-lg font-semibold tracking-tight">
          {group.editionName}
        </h2>
        <Badge variant="secondary" className="tabular-nums">
          {t(
            group.certificates.length === 1
              ? "certificator.pendingCountOne"
              : "certificator.pendingCountMany",
            { count: group.certificates.length },
          )}
        </Badge>
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>{t("certificator.colStudent")}</TableHead>
              <TableHead className="whitespace-nowrap">
                {t("certificator.colRequested")}
              </TableHead>
              <TableHead className="whitespace-nowrap">
                {t("certificator.colSignatures")}
              </TableHead>
              <TableHead />
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.certificates.map((cert) => {
              const state = certState[cert.address];
              return (
                <TableRow
                  key={cert.address}
                  data-selected={selected.has(cert.address)}
                >
                  <TableCell>
                    <CertCheckbox
                      cert={cert}
                      checked={selected.has(cert.address)}
                      onToggle={() => onToggleCert(cert.address)}
                    />
                  </TableCell>
                  {/* The anti-impersonation surface — deliberately the loudest cell. */}
                  <TableCell className="text-base font-semibold">
                    {cert.studentName}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <time
                      dateTime={cert.requestedAt}
                      title={formatDate(cert.requestedAt, locale, "full")}
                    >
                      {formatDate(cert.requestedAt, locale, "dayTime")}
                    </time>
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {cert.signedCount}/{cert.signerCount}
                  </TableCell>
                  <TableCell>
                    <StateBadge state={state} />
                  </TableCell>
                  <TableCell>
                    <CertActions
                      cert={cert}
                      group={group}
                      signerWallet={signerWallet}
                      onReject={onReject}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Phones: six columns cannot fit 393px, and horizontally scrolling a
          list you are meant to tick off row by row loses the checkbox. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {group.certificates.map((cert) => (
          <Card key={cert.address}>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <CertCheckbox
                  cert={cert}
                  checked={selected.has(cert.address)}
                  onToggle={() => onToggleCert(cert.address)}
                />
                <div className="min-w-0 flex-1">
                  {/* The anti-impersonation surface — deliberately the loudest. */}
                  <p className="text-base font-semibold">{cert.studentName}</p>
                  <p className="text-sm text-muted-foreground">
                    <time
                      dateTime={cert.requestedAt}
                      title={formatDate(cert.requestedAt, locale, "full")}
                    >
                      {formatDate(cert.requestedAt, locale, "dayTime")}
                    </time>
                  </p>
                </div>
                <CertActions
                  cert={cert}
                  group={group}
                  signerWallet={signerWallet}
                  onReject={onReject}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {t("certificator.colSignatures")}{" "}
                  <span className="tabular-nums text-foreground">
                    {cert.signedCount}/{cert.signerCount}
                  </span>
                </span>
                <StateBadge state={certState[cert.address]} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
