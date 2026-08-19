"use client";

import { useRef } from "react";
import { QrCode } from "lucide-react";
import type { QrField, SignatureBox, TextField } from "@/lib/render/layout";
import { useT, type TranslationKey } from "@/lib/i18n";
import {
  moveRect,
  moveSquare,
  nudgeRect,
  nudgeSquare,
  rectToPercentStyle,
  resizeRect,
  resizeSquare,
  squareToStyle,
} from "./geometry";
import { DesignerBox } from "./designer-box";
import {
  selectionId,
  selectionsEqual,
  type DesignerLayoutDraft,
  type SelectedBox,
  type TextFieldKey,
} from "./types";

/** Text-field labels, shared with the field-editor panel. */
export const TEXT_FIELD_LABEL_KEYS: Record<TextFieldKey, TranslationKey> = {
  student_name: "designer.field.studentName",
  date: "designer.field.date",
  cert_id: "designer.field.certId",
};

export interface SamplePreviewValues {
  studentName: string;
  dateText: string;
  certId: string;
}

export interface SignaturePreview {
  name: string;
  role: string;
}

export interface DesignerCanvasProps {
  imageUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  draft: DesignerLayoutDraft;
  selected: SelectedBox | null;
  onSelect: (selection: SelectedBox) => void;
  onChangeField: (key: TextFieldKey, patch: Partial<TextField>) => void;
  onChangeQr: (patch: Partial<QrField>) => void;
  onChangeSignature: (index: number, patch: Partial<SignatureBox>) => void;
  sampleValues: SamplePreviewValues;
  signerPreviews: SignaturePreview[];
}

function alignToJustify(
  align: "left" | "center" | "right",
): "flex-start" | "center" | "flex-end" {
  if (align === "left") return "flex-start";
  if (align === "right") return "flex-end";
  return "center";
}

function fontFamilyVar(font: TextField["font"]): string {
  return font === "great-vibes" ? "var(--font-display)" : "var(--font-sans)";
}

function TextFieldContent({
  field,
  text,
}: {
  field: TextField;
  text: string;
}): React.JSX.Element {
  return (
    <div
      className="flex size-full items-center overflow-hidden text-nowrap"
      style={{
        justifyContent: alignToJustify(field.align),
        fontSize: `${field.size * 100}cqh`,
        fontWeight: field.weight,
        color: field.color,
        fontFamily: fontFamilyVar(field.font),
        lineHeight: 1,
      }}
    >
      {text}
    </div>
  );
}

function QrContent(): React.JSX.Element {
  return (
    <div className="flex size-full items-center justify-center rounded-[1px] bg-white/90 p-[8%] text-background">
      <QrCode className="size-full" aria-hidden="true" />
    </div>
  );
}

function SignatureContent({
  box,
  signer,
}: {
  box: SignatureBox;
  signer: SignaturePreview | undefined;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <div
      className="flex size-full flex-col justify-center"
      style={{
        containerType: "size",
        alignItems: alignToJustify(box.align),
      }}
    >
      <div
        className="text-nowrap"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "26cqh",
          color: "#FFFFFF",
          lineHeight: 1,
        }}
      >
        {signer?.name || t("designer.signature.namePlaceholder")}
      </div>
      <div className="mt-[6%] h-px w-full bg-[#7C879E]" />
      <div
        className="mt-[6%] text-nowrap"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13cqh",
          color: "#B7C0D8",
        }}
      >
        {signer?.role || t("designer.signature.rolePlaceholder")}
      </div>
    </div>
  );
}

/**
 * The designer's canvas: the uploaded template as a full-bleed background
 * with draggable/resizable overlay boxes for the four fixed fields + N
 * signature boxes. Doubles as the live preview (deliverable 5) — boxes
 * render the actual sample text/QR/signature content styled per their
 * current font/size/color/align, so dragging shows real content moving
 * rather than empty placeholders. `container-type: size` on the wrapper is
 * what makes `cqh` (container-query height) units resolve — see
 * `geometry.ts`'s `squareToStyle` doc for why that unit specifically.
 */
export function DesignerCanvas({
  imageUrl,
  canvasWidth,
  canvasHeight,
  draft,
  selected,
  onSelect,
  onChangeField,
  onChangeQr,
  onChangeSignature,
  sampleValues,
  signerPreviews,
}: DesignerCanvasProps): React.JSX.Element {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const aspect = canvasWidth / canvasHeight;

  function containerSizePx(): { w: number; h: number } {
    const rect = containerRef.current?.getBoundingClientRect();
    return { w: rect?.width ?? 0, h: rect?.height ?? 0 };
  }

  const textFieldEntries: {
    key: TextFieldKey;
    field: TextField;
    text: string;
  }[] = [
    {
      key: "student_name",
      field: draft.fields.student_name,
      text: sampleValues.studentName,
    },
    { key: "date", field: draft.fields.date, text: sampleValues.dateText },
    { key: "cert_id", field: draft.fields.cert_id, text: sampleValues.certId },
  ];

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-lg border border-border bg-black"
      style={{
        aspectRatio: `${canvasWidth} / ${canvasHeight}`,
        containerType: "size",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI / Supabase-hosted upload, not a static/local asset */}
      <img
        src={imageUrl}
        alt={t("designer.canvas.templateAlt")}
        className="pointer-events-none absolute inset-0 size-full object-fill"
        draggable={false}
      />

      {textFieldEntries.map(({ key, field, text }) => {
        const sel: SelectedBox = { kind: "text", key };
        return (
          <DesignerBox
            key={selectionId(sel)}
            id={selectionId(sel)}
            label={t(TEXT_FIELD_LABEL_KEYS[key])}
            style={rectToPercentStyle(field)}
            selected={selectionsEqual(selected, sel)}
            onSelect={() => onSelect(sel)}
            onMove={(dxPx, dyPx) => {
              const { w, h } = containerSizePx();
              onChangeField(key, moveRect(field, { dxPx, dyPx }, w, h));
            }}
            onResize={(dxPx, dyPx) => {
              const { w, h } = containerSizePx();
              onChangeField(key, resizeRect(field, { dxPx, dyPx }, w, h));
            }}
            onNudge={(dxSteps, dySteps, step) =>
              onChangeField(key, nudgeRect(field, dxSteps, dySteps, step))
            }
          >
            <TextFieldContent field={field} text={text} />
          </DesignerBox>
        );
      })}

      {(() => {
        const sel: SelectedBox = { kind: "qr" };
        return (
          <DesignerBox
            key={selectionId(sel)}
            id={selectionId(sel)}
            label={t("designer.qr.label")}
            style={squareToStyle(draft.qr)}
            selected={selectionsEqual(selected, sel)}
            onSelect={() => onSelect(sel)}
            onMove={(dxPx, dyPx) => {
              const { w, h } = containerSizePx();
              onChangeQr(moveSquare(draft.qr, { dxPx, dyPx }, w, h, aspect));
            }}
            onResize={(dxPx, dyPx) => {
              const { h } = containerSizePx();
              onChangeQr(resizeSquare(draft.qr, { dxPx, dyPx }, h, aspect));
            }}
            onNudge={(dxSteps, dySteps, step) =>
              onChangeQr(nudgeSquare(draft.qr, dxSteps, dySteps, step, aspect))
            }
          >
            <QrContent />
          </DesignerBox>
        );
      })()}

      {draft.signatures.map((box, index) => {
        const sel: SelectedBox = { kind: "signature", index };
        return (
          <DesignerBox
            key={selectionId(sel)}
            id={selectionId(sel)}
            label={t("designer.signature.label", { index: index + 1 })}
            style={rectToPercentStyle(box)}
            selected={selectionsEqual(selected, sel)}
            onSelect={() => onSelect(sel)}
            onMove={(dxPx, dyPx) => {
              const { w, h } = containerSizePx();
              onChangeSignature(index, moveRect(box, { dxPx, dyPx }, w, h));
            }}
            onResize={(dxPx, dyPx) => {
              const { w, h } = containerSizePx();
              onChangeSignature(index, resizeRect(box, { dxPx, dyPx }, w, h));
            }}
            onNudge={(dxSteps, dySteps, step) =>
              onChangeSignature(index, nudgeRect(box, dxSteps, dySteps, step))
            }
          >
            <SignatureContent box={box} signer={signerPreviews[index]} />
          </DesignerBox>
        );
      })}
    </div>
  );
}
