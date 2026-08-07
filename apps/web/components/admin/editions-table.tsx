"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminEditions } from "@/hooks/useAdminEditions";
import { useSetEditionStatus } from "@/hooks/useSetEditionStatus";
import { onAppError } from "@/lib/on-app-error";
import type { EditionStatusValue } from "@/lib/db/types";

const STATUS_LABEL: Record<EditionStatusValue, string> = {
  Open: "Aberta",
  Paused: "Pausada",
  Closed: "Encerrada",
};

const STATUS_VARIANT: Record<
  EditionStatusValue,
  "default" | "secondary" | "outline"
> = {
  Open: "default",
  Paused: "secondary",
  Closed: "outline",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

export function EditionsTable() {
  const { data: editions, isLoading, isError, refetch } = useAdminEditions();
  const setStatus = useSetEditionStatus();

  async function copyLink(slug: string): Promise<void> {
    const url = `${window.location.origin}/editions/${slug}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  }

  function toggleStatus(address: string, current: EditionStatusValue): void {
    const next = current === "Open" ? "Paused" : "Open";
    setStatus.mutate(
      { address, status: next },
      { onError: (err) => onAppError(err) },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
        <p className="text-sm text-muted-foreground">
          Falha ao carregar edições.
        </p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!editions || editions.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
        <p className="text-sm text-muted-foreground">
          Nenhuma edição criada ainda.
        </p>
        <Button asChild size="sm">
          <Link href="/admin/editions/new">Criar edição</Link>
        </Button>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Certificados</TableHead>
          <TableHead>Criada em</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {editions.map((edition) => (
          <TableRow key={edition.address}>
            <TableCell className="font-medium whitespace-normal">
              {edition.name}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[edition.status]}>
                {STATUS_LABEL[edition.status]}
              </Badge>
            </TableCell>
            <TableCell className="tabular-nums">
              {edition.minted}/{edition.maxSupply}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(edition.createdAt)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                {edition.status !== "Closed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={setStatus.isPending}
                    onClick={() =>
                      toggleStatus(edition.address, edition.status)
                    }
                  >
                    {edition.status === "Open" ? "Pausar" : "Abrir"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void copyLink(edition.slug)}
                >
                  Copiar link
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled
                  aria-disabled="true"
                  title="Duplicar como nova edição (em breve) — edições são imutáveis após criadas"
                >
                  Editar
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
