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
import { useMassSign } from "@/hooks/useMassSign";
import { usePendingInbox } from "@/hooks/usePendingInbox";
import { useReject } from "@/hooks/useReject";

const MAX_PER_TX = 20;

export default function CertificatorPage() {
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

  const firstSelected = selectedByEdition[0]?.group;
  const signerWallet = firstSelected
    ? (firstSelected.signers.find(
        (s) => s.position === firstSelected.callerPosition,
      )?.wallet ?? "")
    : "";

  async function runSign() {
    setConfirmOpen(false);
    await massSign.run({
      signerWallet,
      groups: selectedByEdition.map((x) => ({
        editionAddress: x.group.editionAddress,
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
      toast.success("Solicitação rejeitada e aluguel devolvido ao estudante.");
      setRejectTarget(null);
    } catch (err) {
      onAppError(err);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 pb-28">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Certificador</h1>
        {totalPending > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {totalPending} aguardando você
          </Badge>
        )}
      </div>
      <p className="mt-2 text-muted-foreground">
        Confira o nome de cada aluno antes de assinar — sua assinatura fica
        registrada permanentemente na blockchain.
      </p>

      {/* Truthful batch progress, announced politely. */}
      {massSign.progress.running && massSign.progress.totalChunks > 0 && (
        <div
          aria-live="polite"
          className="mt-6 rounded-lg border border-border bg-card px-4 py-3 text-sm"
        >
          Assinando… transação {massSign.progress.confirmedChunks}/
          {massSign.progress.totalChunks} confirmada
        </div>
      )}

      <div className="mt-8">
        {isLoading ? (
          <InboxSkeleton />
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTitle>Falha ao carregar a fila de assinaturas</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>Tente novamente em instantes.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
              >
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <p className="text-base font-medium">
              Nenhum certificado aguardando sua assinatura.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Novas solicitações aparecem aqui automaticamente.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void refetch()}
            >
              Atualizar
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
              <strong>{selectedCount}</strong> selecionado
              {selectedCount === 1 ? "" : "s"} · {txCount} transaç
              {txCount === 1 ? "ão" : "ões"}
            </span>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => setSelected(new Set())}
                disabled={massSign.progress.running}
              >
                Limpar
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={massSign.progress.running || signerWallet === ""}
              >
                {massSign.progress.running
                  ? "Assinando…"
                  : `Assinar ${selectedCount} certificado${selectedCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Assinar {selectedCount} certificado
              {selectedCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                Sua assinatura vale para {selectedCount} aluno
                {selectedCount === 1 ? "" : "s"} em {txCount} transaç
                {txCount === 1 ? "ão" : "ões"} — uma única aprovação na
                carteira. Confira os nomes:
                <ul className="mt-3 list-disc space-y-1 pl-5 text-foreground">
                  {selectedNames.slice(0, 5).map((name, i) => (
                    <li key={i} className="font-medium">
                      {name}
                    </li>
                  ))}
                </ul>
                {selectedNames.length > 5 && (
                  <p className="mt-2">e mais {selectedNames.length - 5}…</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runSign()}>
              Assinar
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
