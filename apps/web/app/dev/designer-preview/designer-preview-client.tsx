"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { WizardDesignerStep } from "@/components/admin/wizard-designer-step";
import { useTemplateDesignerUpload } from "@/components/designer/use-template-upload";
import type {
  DesignerLayoutDraft,
  SelectedBox,
} from "@/components/designer/types";
import { editionWizardSchema, type EditionWizardInput } from "@/lib/schemas";

const DEFAULT_VALUES: EditionWizardInput = {
  meta: {
    name: "Preview",
    slug: "preview",
    maxSupply: undefined,
    completionDate: "",
    description: "",
  },
  signers: [
    {
      wallet: "11111111111111111111111111111111",
      name: "Ana Souza",
      role: "Head de Comunidade",
    },
    {
      wallet: "So11111111111111111111111111111111111111",
      name: "Rafael Oliveira",
      role: "Diretor de Programas",
    },
  ],
  templatePath: "default",
};

/** Renders WizardDesignerStep standalone so it can be driven/eyeballed directly — same component the real wizard uses, just without the other four steps or auth around it. */
export function DesignerPreviewClient(): React.JSX.Element {
  const form = useForm<EditionWizardInput>({
    resolver: zodResolver(editionWizardSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const upload = useTemplateDesignerUpload();
  const [draft, setDraft] = useState<DesignerLayoutDraft | null>(null);
  const [selected, setSelected] = useState<SelectedBox | null>(null);
  const [emitted, setEmitted] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Designer preview (dev only)
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Harness for exercising the M6 designer without a Privy admin login. Not
        part of the real wizard — &ldquo;Continuar&rdquo; prints the emitted
        layout JSON below instead of submitting anywhere.
      </p>

      <div className="mt-8">
        <Form {...form}>
          <WizardDesignerStep
            form={form}
            upload={upload}
            draft={draft}
            onDraftChange={setDraft}
            selected={selected}
            onSelectedChange={setSelected}
            onNext={() =>
              setEmitted(
                JSON.stringify(form.getValues("customLayout"), null, 2),
              )
            }
            onBack={() => setEmitted(null)}
          />
        </Form>

        {emitted && (
          <pre className="mt-6 max-h-96 overflow-auto rounded-lg border border-border bg-card p-4 text-xs">
            {emitted}
          </pre>
        )}
      </div>
    </div>
  );
}
