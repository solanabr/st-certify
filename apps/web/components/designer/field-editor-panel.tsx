"use client";

import { useEffect, useState } from "react";
import type {
  Align,
  FieldFont,
  QrField,
  SignatureBox,
  TextField,
} from "@/lib/render/layout";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clamp, clampRect, clampSquare, round4 } from "./geometry";
import { TEXT_FIELD_LABEL_KEYS } from "./designer-canvas";
import {
  type DesignerLayoutDraft,
  type SelectedBox,
  type TextFieldKey,
} from "./types";

export interface FieldEditorPanelProps {
  selected: SelectedBox | null;
  draft: DesignerLayoutDraft;
  /** Canvas width/height ratio — required to correctly bound the QR box's x position (its `size` is a height-fraction; see `geometry.ts`). */
  aspect: number;
  onChangeField: (key: TextFieldKey, patch: Partial<TextField>) => void;
  onChangeQr: (patch: Partial<QrField>) => void;
  onChangeSignature: (index: number, patch: Partial<SignatureBox>) => void;
}

/**
 * A percent-valued numeric input, two-way bound to a 0-1 fraction. This is
 * the REQUIRED WCAG 2.5.7 dragging-alternative (M6 brief) — every box must
 * be fully positionable/resizable from here with no pointer involved.
 * Native number-input arrow keys already step by `step` for free.
 */
function PercentInput({
  id,
  label,
  fraction,
  onCommit,
}: {
  id: string;
  label: string;
  fraction: number;
  onCommit: (fraction: number) => void;
}): React.JSX.Element {
  const displayValue = round4(fraction * 100);
  const [text, setText] = useState(String(displayValue));

  // Resync only when the committed value changes (drag/resize/nudge/another
  // input) — NOT on every local keystroke, or typing "5" then "0" for "50"
  // would get clobbered mid-edit.
  useEffect(() => {
    setText(String(displayValue));
  }, [displayValue]);

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={0.1}
          min={0}
          max={100}
          value={text}
          className="pr-7 tabular-nums"
          onChange={(e) => {
            setText(e.target.value);
            const parsed = e.target.valueAsNumber;
            if (!Number.isNaN(parsed)) {
              onCommit(clamp(parsed, 0, 100) / 100);
            }
          }}
          onBlur={() => setText(String(displayValue))}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
          %
        </span>
      </div>
    </div>
  );
}

function AlignToggle({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: Align;
  onChange: (align: Align) => void;
}): React.JSX.Element {
  const { t } = useT();
  const options: { value: Align; label: string }[] = [
    { value: "left", label: t("designer.panel.alignLeft") },
    { value: "center", label: t("designer.panel.alignCenter") },
    { value: "right", label: t("designer.panel.alignRight") },
  ];
  return (
    <div className="space-y-1">
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-h-9 flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
              value === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FontToggle({
  id,
  value,
  onChange,
}: {
  id: string;
  value: FieldFont;
  onChange: (font: FieldFont) => void;
}): React.JSX.Element {
  const { t } = useT();
  // Font names are proper nouns — same in every locale.
  const options: { value: FieldFont; label: string }[] = [
    { value: "inter", label: "Inter" },
    { value: "great-vibes", label: "Great Vibes" },
  ];
  return (
    <div className="space-y-1">
      <span id={id} className="text-sm font-medium">
        {t("designer.panel.font")}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-h-9 flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
              value === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
              opt.value === "great-vibes" && "font-display",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WeightToggle({
  value,
  onChange,
}: {
  value: 400 | 600;
  onChange: (weight: 400 | 600) => void;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <div className="space-y-1">
      <span id="weight-toggle-label" className="text-sm font-medium">
        {t("designer.panel.weight")}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="weight-toggle-label"
        className="flex gap-1"
      >
        {([400, 600] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={value === w}
            onClick={() => onChange(w)}
            className={cn(
              "min-h-9 flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
              value === w
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {w === 400
              ? t("designer.panel.weightNormal")
              : t("designer.panel.weightBold")}
          </button>
        ))}
      </div>
    </div>
  );
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function ColorField({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (hex: string) => void;
}): React.JSX.Element {
  const { t } = useT();
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={t("designer.panel.colorPicker", { label })}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
          value={/^#[0-9a-fA-F]{6}$/.test(text) ? text : "#ffffff"}
          onChange={(e) => {
            setText(e.target.value);
            onCommit(e.target.value);
          }}
        />
        <Input
          id={id}
          value={text}
          className="font-mono"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (HEX_COLOR_RE.test(text)) {
              onCommit(text);
            } else {
              setText(value);
            }
          }}
        />
      </div>
    </div>
  );
}

/** Two-column X/Y/W/H (or X/Y/Size) percent grid — the WCAG 2.5.7 core. */
function PositionGrid({
  idPrefix,
  fields,
}: {
  idPrefix: string;
  /** `id` keeps the DOM id stable across locales — `label` is already translated. */
  fields: {
    id: string;
    label: string;
    fraction: number;
    onCommit: (f: number) => void;
  }[];
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((f) => (
        <PercentInput
          key={f.id}
          id={`${idPrefix}-${f.id}`}
          label={f.label}
          fraction={f.fraction}
          onCommit={f.onCommit}
        />
      ))}
    </div>
  );
}

/**
 * The required keyboard/AT alternative to canvas dragging (WCAG 2.5.7): every
 * box's full geometry is editable here as plain numeric inputs, two-way bound
 * so canvas drags and panel edits stay in sync. Which controls appear depends
 * on the selected box's kind — the renderer only reads font/size/color/align
 * for text fields and QR/signature boxes don't carry those properties in
 * M2's schema (`lib/render/layout.ts`), so exposing them there would just be
 * dead state.
 */
export function FieldEditorPanel({
  selected,
  draft,
  aspect,
  onChangeField,
  onChangeQr,
  onChangeSignature,
}: FieldEditorPanelProps): React.JSX.Element {
  const { t } = useT();

  if (!selected) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {t("designer.panel.empty")}
      </div>
    );
  }

  if (selected.kind === "text") {
    const key = selected.key;
    const field = draft.fields[key];
    const patch = (next: Partial<TextField>): void => {
      // `next` only ever carries a subset of {x,y,w,h} at this call site
      // (color/size/align/font commit straight through `onChangeField`
      // below), and `clampRect` always returns all four — so the clamped
      // rect fully replaces `next` here, no merge needed.
      onChangeField(key, clampRect({ ...field, ...next }));
    };
    return (
      <div className="space-y-4">
        <h3 className="font-medium">{t(TEXT_FIELD_LABEL_KEYS[key])}</h3>
        <PositionGrid
          idPrefix={`panel-${key}`}
          fields={[
            {
              id: "x",
              label: t("designer.panel.x"),
              fraction: field.x,
              onCommit: (x) => patch({ x }),
            },
            {
              id: "y",
              label: t("designer.panel.y"),
              fraction: field.y,
              onCommit: (y) => patch({ y }),
            },
            {
              id: "w",
              label: t("designer.panel.width"),
              fraction: field.w,
              onCommit: (w) => patch({ w }),
            },
            {
              id: "h",
              label: t("designer.panel.height"),
              fraction: field.h,
              onCommit: (h) => patch({ h }),
            },
          ]}
        />
        <PercentInput
          id={`panel-${key}-size`}
          label={t("designer.panel.fontSize")}
          fraction={field.size}
          onCommit={(size) => onChangeField(key, { size: clamp(size, 0, 1) })}
        />
        <ColorField
          id={`panel-${key}-color`}
          label={t("designer.panel.color")}
          value={field.color}
          onCommit={(color) => onChangeField(key, { color })}
        />
        <AlignToggle
          id={`panel-${key}-align`}
          label={t("designer.panel.align")}
          value={field.align}
          onChange={(align) => onChangeField(key, { align })}
        />
        <FontToggle
          id={`panel-${key}-font`}
          value={field.font}
          onChange={(font) =>
            onChangeField(key, {
              font,
              // Great Vibes only ships weight 400 (see app/layout.tsx's
              // next/font/local registration) — force it so satori/the
              // browser preview don't silently fall back to a missing weight.
              weight: font === "great-vibes" ? 400 : field.weight,
            })
          }
        />
        {field.font === "inter" && (
          <WeightToggle
            value={field.weight}
            onChange={(weight) => onChangeField(key, { weight })}
          />
        )}
      </div>
    );
  }

  if (selected.kind === "qr") {
    const qr = draft.qr;
    const patch = (next: Partial<QrField>): void => {
      const merged = { ...qr, ...next };
      onChangeQr(clampSquare(merged, aspect));
    };
    return (
      <div className="space-y-4">
        <h3 className="font-medium">{t("designer.qr.label")}</h3>
        <PositionGrid
          idPrefix="panel-qr"
          fields={[
            {
              id: "x",
              label: t("designer.panel.x"),
              fraction: qr.x,
              onCommit: (x) => patch({ x }),
            },
            {
              id: "y",
              label: t("designer.panel.y"),
              fraction: qr.y,
              onCommit: (y) => patch({ y }),
            },
            {
              id: "size",
              label: t("designer.panel.size"),
              fraction: qr.size,
              onCommit: (size) => patch({ size }),
            },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {t("designer.panel.qrHint")}
        </p>
      </div>
    );
  }

  const box = draft.signatures[selected.index];
  const index = selected.index;
  if (!box) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {t("designer.panel.signatureMissing")}
      </div>
    );
  }
  const patch = (next: Partial<SignatureBox>): void => {
    // Same reasoning as the text-field patch above: `next` is always a
    // subset of {x,y,w,h} here (align commits directly), so the clamped
    // rect alone is the correct full replacement.
    onChangeSignature(index, clampRect({ ...box, ...next }));
  };
  return (
    <div className="space-y-4">
      <h3 className="font-medium">
        {t("designer.signature.label", { index: index + 1 })}
      </h3>
      <PositionGrid
        idPrefix={`panel-sig-${index}`}
        fields={[
          {
            id: "x",
            label: t("designer.panel.x"),
            fraction: box.x,
            onCommit: (x) => patch({ x }),
          },
          {
            id: "y",
            label: t("designer.panel.y"),
            fraction: box.y,
            onCommit: (y) => patch({ y }),
          },
          {
            id: "w",
            label: t("designer.panel.width"),
            fraction: box.w,
            onCommit: (w) => patch({ w }),
          },
          {
            id: "h",
            label: t("designer.panel.height"),
            fraction: box.h,
            onCommit: (h) => patch({ h }),
          },
        ]}
      />
      <AlignToggle
        id={`panel-sig-${index}-align`}
        label={t("designer.panel.align")}
        value={box.align}
        onChange={(align) => onChangeSignature(index, { align })}
      />
      <p className="text-xs text-muted-foreground">
        {t("designer.panel.signatureHint")}
      </p>
    </div>
  );
}
