"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { UseFormReturn } from "react-hook-form";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateEdition } from "@/hooks/useCreateEdition";
import { useSetEditionStatus } from "@/hooks/useSetEditionStatus";
import { onAppError } from "@/lib/on-app-error";
import type { EditionWizardInput } from "@/lib/schemas";

interface Props {
  form: UseFormReturn<EditionWizardInput>;
  onOpened: () => void;
}

/**
 * Entering this step fires create_edition immediately (Paused) — the QA
 * sample render is the safety net that catches layout mistakes before any
 * student ever sees this edition. "Voltar" here means leaving the wizard,
 * not undoing the on-chain creation: the edition just stays Paused and is
 * recoverable later from the admin Edições tab (abandonment-safe).
 */
export function WizardQaStep({ form, onOpened }: Props) {
  const router = useRouter();
  const createEdition = useCreateEdition();
  const setStatus = useSetEditionStatus();
  const [created, setCreated] = useState<{
    address: string;
    slug: string;
  } | null>(null);
  const firedRef = useRef(false);

  function fireCreate(): void {
    createEdition.mutate(form.getValues(), {
      onSuccess: (result) => setCreated(result),
      onError: (err) => onAppError(err, form),
    });
  }

  useEffect(() => {
    if (firedRef.current) {
      return;
    }
    firedRef.current = true;
    fireCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly once on entering this step
  }, []);

  async function openEdition(): Promise<void> {
    if (!created) {
      return;
    }
    try {
      await setStatus.mutateAsync({
        address: created.address,
        status: "Open",
      });
      onOpened();
      router.push("/admin");
    } catch (err) {
      onAppError(err);
    }
  }

  if (createEdition.isPending || (!created && !createEdition.isError)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Criando edição on-chain…
        </p>
        <Skeleton className="aspect-[16/11] w-full rounded-lg" />
      </div>
    );
  }

  if (createEdition.isError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Falha ao criar edição</AlertTitle>
          <AlertDescription>
            {createEdition.error?.message ?? "Tente novamente."}
          </AlertDescription>
        </Alert>
        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin")}
          >
            Voltar ao painel
          </Button>
          <Button
            type="button"
            onClick={() => {
              firedRef.current = false;
              fireCreate();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Edição criada e pausada. Confira a amostra abaixo com dados de exemplo
        antes de abrir para o público.
      </p>
      {created && (
        // eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG, not a static/local asset
        <img
          src={`/api/admin/editions/${created.address}/qa-sample`}
          alt="Amostra do certificado com dados de exemplo"
          className="w-full rounded-lg border border-border"
        />
      )}
      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin")}
        >
          Voltar ao painel
        </Button>
        <Button
          type="button"
          onClick={() => void openEdition()}
          disabled={setStatus.isPending}
          aria-busy={setStatus.isPending}
        >
          {setStatus.isPending ? "Abrindo…" : "Abrir edição"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A edição fica pausada até você clicar em &ldquo;Abrir edição&rdquo; —
        você pode sair desta página e retomar depois pelo painel.
      </p>
    </div>
  );
}
