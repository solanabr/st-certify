"use client";

import { useMemo, useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
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
import { Reveal } from "@/components/landing/reveal";
import { EditionGroupTable } from "@/components/certificator/edition-group";
import { InboxSkeleton } from "@/components/certificator/inbox-skeleton";
import {
  RejectDialog,
  type RejectTarget,
} from "@/components/certificator/reject-dialog";
import { BatchDone } from "@/components/sign/batch-done";
import {
  nextSignStep,
  summarizeBatch,
  type BatchSummary,
} from "@/components/sign/ceremony";
import { ConsentPanel } from "@/components/sign/consent-panel";
import { onAppError } from "@/lib/on-app-error";
import { callerSignerWallet } from "@/lib/db/certificator-queries";
import { useT } from "@/lib/i18n";
import { useMassSign } from "@/hooks/useMassSign";
import { useMe } from "@/hooks/useMe";
import { usePendingInbox } from "@/hooks/usePendingInbox";
import { useReject } from "@/hooks/useReject";

const MAX_PER_TX = 20;

export default function CertificatorPage() {
  const { t } = useT();
  const massSign = useMassSign();
  const reject = useReject();
  const { data: me } = useMe();
  const { data, isLoading, isError, refetch } = usePendingInbox(
    massSign.progress.running,
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  // The consent disclosure gates the first wallet prompt of the session, so
  // the acknowledgement lives here rather than per batch (§6.4).
  const [consented, setConsented] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [lastBatch, setLastBatch] = useState<BatchSummary | null>(null);

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

  /** Opens the consent disclosure the first time, the confirm dialog after that. */
  function startSign() {
    if (nextSignStep(consented) === "consent") setConsentOpen(true);
    else setConfirmOpen(true);
  }

  async function runSign() {
    setConfirmOpen(false);
    // Snapshot the batch before the run: `selected` is cleared below, and the
    // completion state has to name the editions that were actually signed.
    // Carries `editionName` for that summary; the run itself ignores it.
    const batch = selectedByEdition.map((x) => ({
      editionAddress: x.group.editionAddress,
      editionName: x.group.editionName,
      signerWallet: callerSignerWallet(x.group),
      certificateAddresses: x.certs.map((c) => c.address),
    }));

    const outcome = await massSign.run({ groups: batch });

    const summary = summarizeBatch(batch, outcome);
    setLastBatch(summary.signed + summary.failed > 0 ? summary : null);
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
      <div>
        <p className="stbr-eyebrow">{t("admin.sign.eyebrow")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("nav.sign")}
          </h1>
          {totalPending > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {t("certificator.awaitingYou", { count: totalPending })}
            </Badge>
          )}
        </div>
        <p className="mt-2 text-muted-foreground">
          {t("certificator.subtitle")}
        </p>
      </div>

      {/* What the last batch accomplished — replaced, not stacked, per run. */}
      {lastBatch && !massSign.progress.running && (
        <BatchDone
          summary={lastBatch}
          showEditionLinks={me?.role === "sysadmin"}
          onDismiss={() => setLastBatch(null)}
        />
      )}

      {/* Truthful batch progress, announced politely. */}
      {massSign.progress.running && massSign.progress.totalChunks > 0 && (
        <div
          aria-live="polite"
          className="elevate mt-6 flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm"
        >
          <Loader2
            className="size-4 shrink-0 text-primary motion-safe:animate-spin"
            aria-hidden="true"
          />
          <span>
            {t("certificator.signingProgress", {
              done: massSign.progress.confirmedChunks,
              total: massSign.progress.totalChunks,
            })}
          </span>
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
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20">
              <CheckCheck className="size-6" aria-hidden="true" />
            </span>
            <p className="mt-4 text-base font-medium">
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
            {groups.map((group, i) => (
              <Reveal key={group.editionAddress} delay={i * 60}>
                <EditionGroupTable
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
              </Reveal>
            ))}
          </div>
        )}
      </div>

      {/* Sticky action bar — in tab order, appears once something is selected.
          The safe-area padding keeps the sign button clear of the iPhone home
          indicator; layout.tsx sets viewport-fit=cover, which is what makes
          env(safe-area-inset-bottom) resolve to anything but 0. */}
      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/80">
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
                onClick={startSign}
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

      <ConsentPanel
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onAgree={() => {
          setConsented(true);
          setConsentOpen(false);
          setConfirmOpen(true);
        }}
      />

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
