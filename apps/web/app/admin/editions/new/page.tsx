"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { WizardMetaStep } from "@/components/admin/wizard-meta-step";
import { WizardQaStep } from "@/components/admin/wizard-qa-step";
import { WizardSignersStep } from "@/components/admin/wizard-signers-step";
import { WizardStepper } from "@/components/admin/wizard-stepper";
import { WizardTemplateStep } from "@/components/admin/wizard-template-step";
import { editionWizardSchema, type EditionWizardInput } from "@/lib/schemas";

const DRAFT_STORAGE_KEY = "certify-edition-wizard-draft";

const DEFAULT_VALUES: EditionWizardInput = {
  meta: {
    name: "",
    slug: "",
    maxSupply: undefined,
    completionDate: "",
    description: "",
  },
  signers: [
    { wallet: "", name: "", role: "" },
    { wallet: "", name: "", role: "" },
  ],
  templatePath: "default",
};

function loadDraft(): EditionWizardInput | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EditionWizardInput) : null;
  } catch {
    return null;
  }
}

export default function NewEditionWizardPage() {
  const [step, setStep] = useState(1);
  const form = useForm<EditionWizardInput>({
    resolver: zodResolver(editionWizardSchema),
    defaultValues: DEFAULT_VALUES,
  });

  // Restore a saved draft once, after mount (sessionStorage doesn't exist
  // during SSR — this intentionally runs after the default-values render).
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      form.reset(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount only
  }, []);

  useEffect(() => {
    const subscription = form.watch((values) => {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(values));
    });
    return () => subscription.unsubscribe();
  }, [form]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Nova edição</h1>

      <div className="mt-8">
        <WizardStepper current={step} />
      </div>

      <div className="mt-10">
        <Form {...form}>
          {step === 1 && (
            <WizardMetaStep form={form} onNext={() => setStep(2)} />
          )}
          {step === 2 && (
            <WizardSignersStep
              form={form}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <WizardTemplateStep
              onNext={() => setStep(5)}
              onBack={() => setStep(2)}
            />
          )}
          {step === 5 && (
            <WizardQaStep
              form={form}
              onOpened={() => sessionStorage.removeItem(DRAFT_STORAGE_KEY)}
            />
          )}
        </Form>
      </div>
    </div>
  );
}
