"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { NUDGE_STEP, NUDGE_STEP_SHIFT } from "./geometry";
import { cn } from "@/lib/utils";

export interface DesignerBoxProps {
  id: string;
  label: string;
  style: CSSProperties;
  selected: boolean;
  onSelect: () => void;
  /** Incremental pointer-move delta (px, since the previous event — not since drag start). */
  onMove: (dxPx: number, dyPx: number) => void;
  onResize: (dxPx: number, dyPx: number) => void;
  /**
   * Arrow-key nudge (WCAG 2.5.7 drag alternative) — fires whenever the box
   * has DOM focus, no pointer required. `dxSteps`/`dySteps` are raw -1/0/1
   * direction, `step` is `NUDGE_STEP` or `NUDGE_STEP_SHIFT` (shift held);
   * deliberately NOT pre-multiplied here so the caller applies the same
   * `nudgeRect`/`nudgeSquare` from `geometry.ts` it uses for every other
   * mutation — this component stays ignorant of rect-vs-square/aspect math.
   */
  onNudge: (dxSteps: number, dySteps: number, step: number) => void;
  children?: ReactNode;
}

/**
 * A single absolutely-positioned, draggable, resizable, keyboard-nudgeable
 * box on the designer canvas. Pure interaction chrome — callers decide what
 * renders inside (sample certificate text, a QR placeholder, ...) via
 * `children`, and own the actual geometry state; this component only ever
 * reports *deltas* (pointer movement, nudge steps), never absolute
 * positions, so it has no opinion on clamping or the fraction/px mapping.
 *
 * Hand-rolled Pointer Events drag (no react-rnd/konva — see M6 brief: React
 * 19 peer risk + unnecessary for ~100 LOC of drag math).
 */
export function DesignerBox({
  id,
  label,
  style,
  selected,
  onSelect,
  onMove,
  onResize,
  onNudge,
  children,
}: DesignerBoxProps): React.JSX.Element {
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const resizeOrigin = useRef<{ x: number; y: number } | null>(null);

  function handleBodyPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return;
    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { x: e.clientX, y: e.clientY };
  }

  function handleBodyPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const origin = dragOrigin.current;
    if (!origin) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    onMove(dx, dy);
  }

  function endBodyDrag(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragOrigin.current) return;
    dragOrigin.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handleResizePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
  ): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeOrigin.current = { x: e.clientX, y: e.clientY };
  }

  function handleResizePointerMove(
    e: React.PointerEvent<HTMLDivElement>,
  ): void {
    const origin = resizeOrigin.current;
    if (!origin) return;
    e.stopPropagation();
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    resizeOrigin.current = { x: e.clientX, y: e.clientY };
    onResize(dx, dy);
  }

  function endResizeDrag(e: React.PointerEvent<HTMLDivElement>): void {
    if (!resizeOrigin.current) return;
    e.stopPropagation();
    resizeOrigin.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

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
    onSelect();
    onNudge(dx, dy, step);
  }

  return (
    <div
      id={`designer-box-${id}`}
      role="button"
      tabIndex={0}
      aria-label={`${label} — arraste para mover, use as setas do teclado para ajustar a posição`}
      aria-pressed={selected}
      className={cn(
        "group absolute cursor-move touch-none rounded-[2px] border-2 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-ring bg-ring/10"
          : "border-white/40 hover:border-white/70",
      )}
      style={style}
      onPointerDown={handleBodyPointerDown}
      onPointerMove={handleBodyPointerMove}
      onPointerUp={endBodyDrag}
      onPointerCancel={endBodyDrag}
      onKeyDown={handleKeyDown}
      onFocus={onSelect}
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

      {/*
        Hidden from AT (aria-hidden) rather than made keyboard-operable:
        resizing this way is a pointer-only convenience, and the FULL
        equivalent function already exists as labeled W/H numeric inputs in
        the field-editor panel (WCAG 2.5.7) — presenting a drag-only handle
        as if it were meaningfully keyboard-reachable would be worse than
        just pointing AT users at the real alternative.

        The hit target is a size-6 (24px) box — WCAG 2.5.8's minimum —
        wrapping a smaller size-3 visible dot, so the resize affordance
        stays visually unobtrusive without shrinking the actual target.
      */}
      <div
        role="presentation"
        aria-hidden="true"
        className={cn(
          "absolute -right-2 -bottom-2 flex size-6 touch-none cursor-nwse-resize items-center justify-center",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={endResizeDrag}
        onPointerCancel={endResizeDrag}
      >
        <span className="size-3 rounded-full border-2 border-background bg-ring" />
      </div>
    </div>
  );
}
