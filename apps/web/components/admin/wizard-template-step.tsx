"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

/** Only the default-template path is selectable in M3 — "Enviar PNG" opens the M6 designer (step 4). */
export function WizardTemplateStep({ onNext, onBack }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-primary ring-1 ring-primary">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <div
              className="gradient-solana-accent flex size-16 items-center justify-center rounded-lg text-2xl font-semibold text-background"
              aria-hidden="true"
            >
              S
            </div>
            <div>
              <p className="font-semibold">Padrão Superteam BR</p>
              <p className="text-sm text-muted-foreground">
                Template pronto, um clique.
              </p>
            </div>
            <span className="flex items-center gap-1 text-sm text-primary">
              <Check className="size-4" /> Selecionado
            </span>
          </CardContent>
        </Card>

        <Card className="opacity-50">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <div
              className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-2xl text-muted-foreground"
              aria-hidden="true"
            >
              +
            </div>
            <div>
              <p className="font-semibold">Enviar PNG</p>
              <p className="text-sm text-muted-foreground">
                Designer personalizado (em breve).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button type="button" onClick={onNext}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
