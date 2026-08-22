"use client";

import { type CSSProperties, type ReactNode } from "react";
import { NUDGE_STEP, NUDGE_STEP_SHIFT } from "./geometry";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface DesignerBoxProps {
  id: string;
  label: string;
  style: CSSProperties;
  /** In the current selection — drawn with the accent outline. */
  selected: boolean;
  /** The one the field-editor panel is bound to (last one selected). */
  primary: boolean;
  /** `additive` is shift/ctrl/cmd-click: extend the selection instead of replacing it. */
  onSelect: (id: string, additive: boolean) => void;
  /**
   * Arrow-key nudge (WCAG 2.5.7 drag alternative). Raw -1/0/1 directions plus
   * the step size, never pre-multiplied — the canvas applies the same
   * `geometry.ts` helpers it uses for pointer gestures, so this component
   * stays ignorant of rect-vs-square and aspect math.
   */
  onNudge: (dxSteps: number, dySteps: number, step: number) => void;
  children?: ReactNode;
}

/**
 * One box on the canvas. Pointer drag and resize belong to react-moveable
 * (which targets this element by its `data-designer-box` id and renders its
 * own ≥44px handles outside it), so what's left here is selection, the
 * keyboard path, and accessible naming — plus `touch-action: none`, without
 * which a touch drag scrolls the page instead of moving the box.
 */
export function DesignerBox({
  id,
  label,
  style,
  selected,
  primary,
  onSelect,
  onNudge,
  children,
}: DesignerBoxProps): React.JSX.Element {
  const { t } = useT();

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const step = e.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -1;
    else if (e.key === "ArrowRight") dx = 1;
    else if (e.key === "ArrowUp") dy = -1;
    else if (e.key === "ArrowDown") dy = 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    onNudge(dx, dy, step);
  }

  return (
    <div
      id={`designer-box-${id}`}
      data-designer-box={id}
      role="button"
      tabIndex={0}
      aria-label={t("designer.box.aria", { label })}
      aria-pressed={selected}
      className={cn(
        "group absolute cursor-move touch-none rounded-[2px] border-2 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-ring bg-ring/10"
          : "border-white/40 hover:border-white/70",
        primary && "border-ring",
      )}
      style={style}
      onPointerDown={(e) => onSelect(id, e.shiftKey || e.metaKey || e.ctrlKey)}
      onKeyDown={handleKeyDown}
      onFocus={() => onSelect(id, false)}
    >
      <span
        className={cn(
          "pointer-events-none absolute -top-6 left-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
          selected
            ? "bg-ring text-background"
            : "bg-black/70 text-white opacity-0 group-hover:opacity-100",
        )}
      >
        {label}
      </span>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
