"use client";

import { useDraggable } from "@dnd-kit/core";
import { CalendarDays, Hash, PenLine, QrCode, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DesignerLayer } from "./layers";
import type { SelectedBox } from "./types";

export const CANVAS_DROPPABLE_ID = "designer-canvas";

const TEXT_FIELD_ICONS: Record<string, LucideIcon> = {
  student_name: User,
  date: CalendarDays,
  cert_id: Hash,
};

export function layerIcon(selection: SelectedBox): LucideIcon {
  if (selection.kind === "qr") return QrCode;
  if (selection.kind === "signature") return PenLine;
  return TEXT_FIELD_ICONS[selection.key] ?? User;
}

interface PaletteItemProps {
  layer: DesignerLayer;
  label: string;
  armed: boolean;
  onArm: (id: string) => void;
}

/**
 * One palette chip. Two ways to reposition its box, because neither alone
 * covers every input: dragging it onto the canvas (dnd-kit, familiar on a
 * mouse) and tapping it to arm click-to-place (a tap on the chip, then a tap
 * where the box should go — no sustained precision, which is the whole point
 * on a tablet).
 */
function PaletteItem({
  layer,
  label,
  armed,
  onArm,
}: PaletteItemProps): React.JSX.Element {
  const { t } = useT();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: layer.id,
  });
  const Icon = layerIcon(layer.selection);

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      // After the spread on purpose: dnd-kit sets `aria-pressed` to mean
      // "being dragged", and here it has to mean "armed for placement".
      aria-pressed={armed}
      aria-label={t("designer.palette.itemAria", { label })}
      onClick={() => onArm(layer.id)}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        "touch-none",
        armed
          ? "border-ring bg-ring/15 text-foreground"
          : "border-border text-muted-foreground hover:border-white/40 hover:text-foreground",
        isDragging && "opacity-40",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export interface DesignerPaletteProps {
  layers: DesignerLayer[];
  labelFor: (layer: DesignerLayer) => string;
  armedId: string | null;
  onArm: (id: string) => void;
  hintKey?: TranslationKey;
}

/**
 * The field palette. The certificate schema fixes which boxes exist (three
 * text fields, a QR, one signature per signer from wizard step 2), so this
 * places existing boxes rather than creating new ones — there is nothing to
 * add or delete here, and pretending otherwise would let an admin build a
 * layout the renderer can't draw.
 */
export function DesignerPalette({
  layers,
  labelFor,
  armedId,
  onArm,
  hintKey = "designer.palette.hint",
}: DesignerPaletteProps): React.JSX.Element {
  const { t } = useT();
  return (
    <section aria-labelledby="designer-palette-heading" className="space-y-2">
      <h3
        id="designer-palette-heading"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {t("designer.palette.title")}
      </h3>
      <div className="space-y-1.5">
        {layers.map((layer) => (
          <PaletteItem
            key={layer.id}
            layer={layer}
            label={labelFor(layer)}
            armed={armedId === layer.id}
            onArm={onArm}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t(hintKey)}</p>
    </section>
  );
}
