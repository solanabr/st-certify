"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditionGroupTable } from "@/components/certificator/edition-group";
import { InboxSkeleton } from "@/components/certificator/inbox-skeleton";
import {
  RejectDialog,
  type RejectTarget,
} from "@/components/certificator/reject-dialog";
import { onAppError } from "@/lib/on-app-error";
import { callerSignerWallet } from "@/lib/db/certificator-queries";
import { useT } from "@/lib/i18n";
import { useMassSign } from "@/hooks/useMassSign";
import { usePendingInbox } from "@/hooks/usePendingInbox";
import { useReject } from "@/hooks/useReject";

const MAX_PER_TX = 20;

export default function CertificatorPage() {
  const { t } = useT();
  const massSign = useMassSign();
  const reject = useReject();
  const { data, isLoading, isError, refetch } = usePendingInbox(
    massSign.progress.running,
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);

  const groups = useMemo(() => data ?? [], [data]);
  const totalPending = groups.reduce((n, g) => n + g.certificates.length, 0);

  function toggleCert(addr: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      return next;
    });
  }

  function toggleAll(addresses: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of addresses) {
        if (checked) next.add(a);
        else next.delete(a);
      }
      return next;
    });
  }

  const selectedByEdition = useMemo(
    () =>
      groups
        .map((group) => ({
          group,
          certs: group.certificates.filter((c) => selected.has(c.address)),
        }))
        .filter((x) => x.certs.length > 0),
    [groups, selected],
  );

  const selectedCount = selectedByEdition.reduce(
    (n, x) => n + x.certs.length,
    0,
  );
  const txCount = selectedByEdition.reduce(
    (n, x) => n + Math.ceil(x.certs.length / MAX_PER_TX),
    0,
  );
  const selectedNames = selectedByEdition.flatMap((x) =>
    x.certs.map((c) => c.studentName),
  );
  const txPhrase = t(
    txCount === 1 ? "certificator.txCountOne" : "certificator.txCountMany",
    { count: txCount },
  );

  // Each edition can register the caller under a different wallet — resolve
  // per group (mirrors the reject path's per-row resolution), never reuse a
  // single wallet across the whole selection.
  const hasUnresolvedSigner = selectedByEdition.some(
    (x) => callerSignerWallet(x.group) === "",
  );
  const distinctSignerCount = new Set(
    selectedByEdition.map((x) => callerSignerWallet(x.group)),
  ).size;

  async function runSign() {
    setConfirmOpen(false);
    await massSign.run({
      groups: selectedByEdition.map((x) => ({
        editionAddress: x.group.editionAddress,
        signerWallet: callerSignerWallet(x.group),
        certificateAddresses: x.certs.map((c) => c.address),
      })),
    });
    setSelected(new Set());
  }

  async function runReject(reason: string) {
    if (!rejectTarget) return;
    try {
      await reject.mutateAsync({
        certificateAddress: rejectTarget.certificateAddress,
        editionAddress: rejectTarget.editionAddress,
        studentRefund: rejectTarget.ownerWallet,
        reason: reason.trim() || undefined,
        signerWallet: rejectTarget.signerWallet,
      });
      toast.success(t("certificator.rejectSuccess"));
      setRejectTarget(null);
    } catch (err) {
      onAppError(err);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 pb-28">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("nav.sign")}
        </h1>
        {totalPending > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {t("certificator.awaitingYou", { count: totalPending })}
          </Badge>
        )}
      </div>
      <p className="mt-2 text-muted-foreground">{t("certificator.subtitle")}</p>

      {/* Truthful batch progress, announced politely. */}
      {massSign.progress.running && massSign.progress.totalChunks > 0 && (
        <div
          aria-live="polite"
          className="mt-6 rounded-lg border border-border bg-card px-4 py-3 text-sm"
        >
          {t("certificator.signingProgress", {
            done: massSign.progress.confirmedChunks,
            total: massSign.progress.totalChunks,
          })}
        </div>
      )}

      <div className="mt-8">
        {isLoading ? (
          <InboxSkeleton />
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("certificator.loadError")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{t("certificator.loadErrorHint")}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
              >
                {t("certificator.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <p className="text-base font-medium">
              {t("certificator.emptyTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("certificator.emptyHint")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void refetch()}
            >
              {t("certificator.refresh")}
            </Button>
          </div>
        ) : (
          <div className="space-y-10">
            {groups.map((group) => (
              <EditionGroupTable
                key={group.editionAddress}
                group={group}
                selected={selected}
                certState={massSign.progress.certState}
                onToggleCert={toggleCert}
                onToggleAll={(checked) =>
                  toggleAll(
                    group.certificates.map((c) => c.address),
                    checked,
                  )
                }
                onReject={setRejectTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sticky action bar — in tab order, appears once something is selected. */}
      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <span className="text-sm tabular-nums">
              <strong>{selectedCount}</strong>{" "}
              {t(
                selectedCount === 1
                  ? "certificator.selectionSummaryOne"
                  : "certificator.selectionSummaryMany",
                { txs: txPhrase },
              )}
            </span>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => setSelected(new Set())}
                disabled={massSign.progress.running}
              >
                {t("certificator.clear")}
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={massSign.progress.running || hasUnresolvedSigner}
              >
                {massSign.progress.running
                  ? t("certificator.signing")
                  : t(
                      selectedCount === 1
                        ? "certificator.signCountOne"
                        : "certificator.signCountMany",
                      { count: selectedCount },
                    )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                selectedCount === 1
                  ? "certificator.confirmTitleOne"
                  : "certificator.confirmTitleMany",
                { count: selectedCount },
              )}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {t(
                  selectedCount === 1
                    ? "certificator.confirmBodyOne"
                    : "certificator.confirmBodyMany",
                  {
                    count: selectedCount,
                    txs: txPhrase,
                    approvals: t(
                      distinctSignerCount === 1
                        ? "certificator.approvalsOne"
                        : "certificator.approvalsMany",
                      { count: distinctSignerCount },
                    ),
                  },
                )}
                <ul className="mt-3 list-disc space-y-1 pl-5 text-foreground">
                  {selectedNames.slice(0, 5).map((name, i) => (
                    <li key={i} className="font-medium">
                      {name}
                    </li>
                  ))}
                </ul>
                {selectedNames.length > 5 && (
                  <p className="mt-2">
                    {t("certificator.andMore", {
                      count: selectedNames.length - 5,
                    })}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("certificator.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runSign()}>
              {t("certificator.sign")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RejectDialog
        target={rejectTarget}
        pending={reject.isPending}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        onConfirm={(reason) => void runReject(reason)}
      />
    </div>
  );
}
