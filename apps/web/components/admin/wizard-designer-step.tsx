"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { UseFormReturn } from "react-hook-form";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DesignerCanvas } from "@/components/designer/designer-canvas";
import { FieldEditorPanel } from "@/components/designer/field-editor-panel";
import { TemplateUploadCard } from "@/components/designer/template-upload-card";
import type { UseTemplateDesignerUpload } from "@/components/designer/use-template-upload";
import type {
  DesignerLayoutDraft,
  SelectedBox,
  TextFieldKey,
} from "@/components/designer/types";
import {
  editionReadyLayoutSchema,
  type Layout,
  type QrField,
  type SignatureBox,
  type TextField,
} from "@/lib/render/layout";
import { useT } from "@/lib/i18n";
import type { EditionWizardInput } from "@/lib/schemas";

interface Props {
  form: UseFormReturn<EditionWizardInput>;
  /**
   * Upload state + draft/selection are owned by the wizard page (not this
   * component) and passed down, because this step unmounts every time the
   * admin navigates elsewhere (e.g. "Voltar" to step 3 to fix a signer) —
   * local state here would throw away the uploaded image and every box the
   * admin just positioned. Everything else in this file is ordinary local
   * logic; only the two pieces of state that must SURVIVE a remount are
   * lifted.
   */
  upload: UseTemplateDesignerUpload;
  draft: DesignerLayoutDraft | null;
  onDraftChange: Dispatch<SetStateAction<DesignerLayoutDraft | null>>;
  selected: SelectedBox | null;
  onSelectedChange: Dispatch<SetStateAction<SelectedBox | null>>;
  onNext: () => void;
  onBack: () => void;
}

const SAMPLE_DATE_TEXT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date());

/** Evenly distributes `count` signature boxes in a bottom band, non-overlapping regardless of the uploaded image's own content — just a sane starting point the admin drags from. */
function evenSignatureBoxes(count: number): SignatureBox[] {
  const marginX = 0.06;
  const rightBound = 0.94;
  const gapX = 0.02;
  const usableWidth = rightBound - marginX;
  const boxW =
    count > 0 ? (usableWidth - gapX * (count - 1)) / count : usableWidth;
  return Array.from({ length: count }, (_, i) => ({
    x: marginX + i * (boxW + gapX),
    y: 0.78,
    w: boxW,
    h: 0.12,
    align: "center" as const,
  }));
}

function seedDraft(signerCount: number): DesignerLayoutDraft {
  return {
    fields: {
      student_name: {
        x: 0.1,
        y: 0.4,
        w: 0.8,
        h: 0.1,
        size: 0.06,
        color: "#FFFFFF",
        align: "center",
        font: "inter",
        weight: 600,
      },
      date: {
        x: 0.1,
        y: 0.52,
        w: 0.8,
        h: 0.04,
        size: 0.02,
        color: "#94A3B8",
        align: "center",
        font: "inter",
        weight: 400,
      },
      cert_id: {
        x: 0.1,
        y: 0.92,
        w: 0.8,
        h: 0.03,
        size: 0.014,
        color: "#94A3B8",
        align: "center",
        font: "inter",
        weight: 400,
      },
    },
    qr: { x: 0.86, y: 0.06, size: 0.1 },
    signatures: evenSignatureBoxes(signerCount),
  };
}

/**
 * Wizard step 4 (custom-template path only): upload -> position fields ->
 * emit a Layout that validates against M2's exact schema. This step does
 * NOT publish anything itself — "Continuar" just writes `customLayout` onto
 * the shared RHF form; step 5 (WizardQaStep, unmodified) fires the same
 * create_edition call the default-template path already uses.
 */
export function WizardDesignerStep({
  form,
  upload,
  draft,
  onDraftChange,
  selected,
  onSelectedChange,
  onNext,
  onBack,
}: Props): React.JSX.Element {
  const { t } = useT();
  const signers = form.watch("signers");
  const {
    status,
    asset,
    error,
    upload: uploadFile,
    reset: resetUpload,
  } = upload;
  // Step-local only (unlike draft/selected/upload, losing this on remount is
  // fine — it just re-shows validation-free once the admin comes back).
  const [submitError, setSubmitErrorState] = useState<string | null>(null);

  useEffect(() => {
    if (asset && !draft) {
      onDraftChange(seedDraft(signers.length));
    }
    // The `!draft` guard above is what makes this "seed once" — adding
    // signers.length/onDraftChange below satisfies exhaustive-deps without
    // re-seeding on every `signers` change (that's the separate auto-sync
    // effect below), since draft is already set by the time either changes.
  }, [asset, draft, signers.length, onDraftChange]);

  // Auto-sync signature box count to the step-2 signer count (deliverable
  // 3): preserves existing box positions for overlapping indices, only
  // appends/trims at the tail — covers the admin going back to step 2 to
  // add/remove a signer after already having designed step 4.
  useEffect(() => {
    if (!draft || draft.signatures.length === signers.length) {
      return;
    }
    onDraftChange((prev) => {
      if (!prev || prev.signatures.length === signers.length) {
        return prev;
      }
      if (signers.length > prev.signatures.length) {
        const seeded = evenSignatureBoxes(signers.length);
        const extra = seeded.slice(prev.signatures.length);
        return { ...prev, signatures: [...prev.signatures, ...extra] };
      }
      return { ...prev, signatures: prev.signatures.slice(0, signers.length) };
    });
  }, [draft, signers.length, onDraftChange]);

  const signerPreviews = useMemo(
    () =>
      signers.map((s) => ({
        name: s.name || t("admin.designer.signerNameFallback"),
        role: s.role || t("admin.signers.rolePlaceholder"),
      })),
    [signers, t],
  );

  function updateField(key: TextFieldKey, patch: Partial<TextField>): void {
    onDraftChange((prev) =>
      prev
        ? {
            ...prev,
            fields: {
              ...prev.fields,
              [key]: { ...prev.fields[key], ...patch },
            },
          }
        : prev,
    );
  }

  function updateQr(patch: Partial<QrField>): void {
    onDraftChange((prev) =>
      prev ? { ...prev, qr: { ...prev.qr, ...patch } } : prev,
    );
  }

  function updateSignature(index: number, patch: Partial<SignatureBox>): void {
    onDraftChange((prev) => {
      if (!prev) return prev;
      const signatures = prev.signatures.map((box, i) =>
        i === index ? { ...box, ...patch } : box,
      );
      return { ...prev, signatures };
    });
  }

  function handleContinue(): void {
    if (!asset || !draft) return;
    setSubmitErrorState(null);

    const layout: Layout = {
      version: 1,
      canvas: { width: asset.width, height: asset.height },
      template: { sha256: asset.sha256 },
      signers: signers.map((s) => ({
        wallet: s.wallet,
        name: s.name,
        role: s.role,
      })),
      // M2's schema nests `qr` inside `fields` (`lib/render/layout.ts`'s
      // `fieldsSchema`); `DesignerLayoutDraft` keeps it as a sibling instead
      // — its geometry (a square, sized off canvas height) is different
      // enough from the three text fields that treating it uniformly with
      // them throughout the designer would need more branching, not less.
      // Reassemble the schema shape here, at the one boundary that needs it.
      fields: { ...draft.fields, qr: draft.qr },
      signatures: draft.signatures,
    };

    const parsed = editionReadyLayoutSchema.safeParse(layout);
    if (!parsed.success) {
      setSubmitErrorState(
        parsed.error.issues[0]?.message ?? t("admin.designer.invalidLayout"),
      );
      return;
    }

    form.setValue("templatePath", "custom", { shouldValidate: false });
    form.setValue("customLayout", parsed.data, { shouldValidate: false });
    onNext();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium">{t("admin.designer.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("admin.designer.intro", { count: signers.length })}
        </p>
      </div>

      {!asset && (
        <TemplateUploadCard
          status={status}
          error={error}
          onFile={(f) => void uploadFile(f)}
        />
      )}

      {asset?.degraded && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>{t("admin.designer.uploadPendingTitle")}</AlertTitle>
          <AlertDescription>
            {asset.degradedReason ?? t("admin.designer.storageNotConfigured")}{" "}
            {t("admin.designer.uploadPendingBody")}
          </AlertDescription>
        </Alert>
      )}

      {asset && draft && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-2">
            <DesignerCanvas
              imageUrl={asset.previewUrl}
              canvasWidth={asset.width}
              canvasHeight={asset.height}
              draft={draft}
              selected={selected}
              onSelect={onSelectedChange}
              onChangeField={updateField}
              onChangeQr={updateQr}
              onChangeSignature={updateSignature}
              sampleValues={{
                studentName: "Maria da Silva",
                dateText: SAMPLE_DATE_TEXT,
                certId: "CERT-PREVIEW",
              }}
              signerPreviews={signerPreviews}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                resetUpload();
                onSelectedChange(null);
              }}
            >
              {t("admin.designer.changeImage")}
            </Button>
          </div>
          <FieldEditorPanel
            selected={selected}
            draft={draft}
            aspect={asset.width / asset.height}
            onChangeField={updateField}
            onChangeQr={updateQr}
            onChangeSignature={updateSignature}
          />
        </div>
      )}

      {submitError && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("admin.designer.cannotContinue")}</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          {t("admin.back")}
        </Button>
        <Button
          type="button"
          onClick={handleContinue}
          disabled={!asset || !draft}
        >
          {t("admin.continue")}
        </Button>
      </div>
    </div>
  );
}
