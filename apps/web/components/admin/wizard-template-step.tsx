"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { EditionWizardInput } from "@/lib/schemas";

type TemplateChoice = "default" | "custom";

interface Props {
  form: UseFormReturn<EditionWizardInput>;
  onNext: (choice: TemplateChoice) => void;
  onBack: () => void;
}

interface CardDef {
  value: TemplateChoice;
  icon: string;
  title: string;
  description: string;
}

const CARDS: CardDef[] = [
  {
    value: "default",
    icon: "S",
    title: "Padrão Superteam BR",
    description: "Template pronto, um clique.",
  },
  {
    value: "custom",
    icon: "+",
    title: "Enviar PNG",
    description: "Envie sua imagem e posicione os campos.",
  },
];

/**
 * Both cards are selectable (M6 activates "Enviar PNG", previously
 * disabled). Selecting "default" skips straight to step 5 (QA), matching
 * M3's original one-click flow unchanged; selecting "custom" routes to step
 * 4 (the designer) — `page.tsx` decides the step number from the choice
 * this returns via `onNext`.
 */
export function WizardTemplateStep({ form, onNext, onBack }: Props) {
  const [choice, setChoice] = useState<TemplateChoice>(
    form.getValues("templatePath") || "default",
  );

  function handleContinue(): void {
    form.setValue("templatePath", choice, { shouldValidate: false });
    onNext(choice);
  }

  return (
    <div className="space-y-6">
      <div
        role="radiogroup"
        aria-label="Escolha do template"
        className="grid gap-4 sm:grid-cols-2"
      >
        {CARDS.map((card) => {
          const selected = choice === card.value;
          return (
            <Card
              key={card.value}
              role="radio"
              tabIndex={0}
              aria-checked={selected}
              onClick={() => setChoice(card.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setChoice(card.value);
                }
              }}
              className={cn(
                "cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                selected
                  ? "border-primary ring-1 ring-primary"
                  : "hover:border-muted-foreground/40",
              )}
            >
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <div
                  className={cn(
                    "flex size-16 items-center justify-center rounded-lg text-2xl",
                    selected
                      ? "gradient-solana-accent font-semibold text-background"
                      : "border border-dashed border-border text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {card.icon}
                </div>
                <div>
                  <p className="font-semibold">{card.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {card.description}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex h-5 items-center gap-1 text-sm text-primary",
                    !selected && "invisible",
                  )}
                >
                  <Check className="size-4" /> Selecionado
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button type="button" onClick={handleContinue}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
