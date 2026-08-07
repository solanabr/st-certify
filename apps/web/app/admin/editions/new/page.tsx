"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { WizardMetaStep } from "@/components/admin/wizard-meta-step";
import { WizardDesignerStep } from "@/components/admin/wizard-designer-step";
import { WizardQaStep } from "@/components/admin/wizard-qa-step";
import { WizardSignersStep } from "@/components/admin/wizard-signers-step";
import { WizardStepper } from "@/components/admin/wizard-stepper";
import { WizardTemplateStep } from "@/components/admin/wizard-template-step";
import { useTemplateDesignerUpload } from "@/components/designer/use-template-upload";
import type {
  DesignerLayoutDraft,
  SelectedBox,
} from "@/components/designer/types";
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
  const templatePath = form.watch("templatePath");

  // Step 4 (designer) state lives here, not inside WizardDesignerStep: that
  // step unmounts every time the admin navigates to a different step (same
  // as every other step component), which would otherwise throw away the
  // uploaded image and every box the admin just positioned the moment they
  // go back to fix a signer's name. The uploaded image itself (a data URI,
  // potentially several MB) deliberately stays OUT of the RHF form for the
  // same reason `customLayout` is safe to store there: the sessionStorage
  // draft-persistence effect below serializes the whole form on every
  // change, and an image-sized field in it would make that both slow and
  // liable to exceed the sessionStorage quota.
  const templateUpload = useTemplateDesignerUpload();
  const [designerDraft, setDesignerDraft] =
    useState<DesignerLayoutDraft | null>(null);
  const [designerSelected, setDesignerSelected] = useState<SelectedBox | null>(
    null,
  );

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
    <div
      className={cn(
        "mx-auto px-4 py-12",
        // Step 4 (designer) needs room for the canvas + side panel; every
        // other step keeps the original narrower form width.
        step === 4 ? "max-w-5xl" : "max-w-2xl",
      )}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Nova edição</h1>

      <div className="mt-8">
        <WizardStepper
          current={step}
          skip={templatePath === "custom" ? [] : [4]}
        />
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
              form={form}
              onNext={(choice) => setStep(choice === "custom" ? 4 : 5)}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <WizardDesignerStep
              form={form}
              upload={templateUpload}
              draft={designerDraft}
              onDraftChange={setDesignerDraft}
              selected={designerSelected}
              onSelectedChange={setDesignerSelected}
              onNext={() => setStep(5)}
              onBack={() => setStep(3)}
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
