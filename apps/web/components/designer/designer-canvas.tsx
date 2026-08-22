"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import Moveable, {
  type OnDrag,
  type OnDragGroup,
  type OnDragStart,
  type OnResize,
  type OnResizeStart,
} from "react-moveable";
import Selecto from "react-selecto";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import type { SignatureBox, TextField } from "@/lib/render/layout";
import { useT, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  offsetRect,
  offsetSquare,
  rectToPercentStyle,
  resizeRectTo,
  resizeSquareTo,
  squareToStyle,
} from "./geometry";
import {
  boxGeometry,
  isSquareSelection,
  type BoxGeometry,
  type BoxGeometryChange,
} from "./box-geometry";
import { orderedLayers, parseSelectionId } from "./layers";
import {
  clientPointToFrac,
  screenDeltaToFrac,
  surfaceSizePx,
  type CanvasViewport,
  type FracPoint,
} from "./viewport";
import { DesignerBox } from "./designer-box";
import { CANVAS_DROPPABLE_ID } from "./palette";
import { type DesignerLayoutDraft, type TextFieldKey } from "./types";

/** Text-field labels, shared with the field-editor panel and the palette. */
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
  /** Stacking order, bottom first (view state — see `layers.ts`). */
  order: string[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  viewport: CanvasViewport;
  /** All boxes moved by one gesture arrive together, keyed so they undo as one step. */
  onGeometryChange: (changes: BoxGeometryChange[], gestureKey: string) => void;
  onNudge: (dxSteps: number, dySteps: number, step: number) => void;
  sampleValues: SamplePreviewValues;
  signerPreviews: SignaturePreview[];
  /** Box armed for click-to-place, or null. */
  armedId: string | null;
  onPlace: (id: string, point: FracPoint) => void;
  onCancelPlacement: () => void;
  /** Ruler guides, in the same 0..1 space as the layout. */
  guides: { vertical: number[]; horizontal: number[] };
}

/**
 * Enlarges react-moveable's default 14px handles to a 44px effective touch
 * target (WCAG 2.5.8 / Apple's HIG minimum) without making the visible dot
 * bigger, by hanging a transparent ::after off each control. Scoped to this
 * component's own `designer-moveable` class and colocated here rather than
 * added to globals.css: it is meaningless outside this canvas.
 */
const MOVEABLE_TOUCH_CSS = `
.designer-moveable .moveable-control {
  width: 14px;
  height: 14px;
  margin-top: -7px;
  margin-left: -7px;
  border-width: 2px;
}
.designer-moveable .moveable-control::after {
  content: "";
  position: absolute;
  inset: -15px;
}
`;

/**
 * Deliberately no `overflow-hidden`: the boxes are clamped inside [0,1]
 * anyway, and clipping here would cut off moveable's handles wherever a box
 * sits against a canvas edge. The image carries its own rounding instead.
 */
const SURFACE_CLASS =
  "relative shrink-0 touch-none rounded-lg border border-border bg-black";

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
      style={{ containerType: "size", alignItems: alignToJustify(box.align) }}
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

function boxIdOf(element: Element | null | undefined): string | null {
  if (!(element instanceof HTMLElement)) return null;
  return element.dataset.designerBox ?? null;
}

function translateGeometry(
  start: BoxGeometry,
  dx: number,
  dy: number,
  aspect: number,
): BoxGeometry {
  return start.kind === "rect"
    ? { kind: "rect", rect: offsetRect(start.rect, dx, dy) }
    : { kind: "square", square: offsetSquare(start.square, dx, dy, aspect) };
}

/**
 * The designer's canvas: the uploaded template rendered at its real pixel
 * size for the current zoom, with the four fixed fields + N signature boxes
 * overlaid as absolutely-positioned percentage boxes.
 *
 * Pointer manipulation is react-moveable's (drag, 8-handle resize, snapping
 * to the other boxes, the canvas edges/centre and the ruler guides) and
 * marquee multi-select is react-selecto's; both report screen-space numbers
 * that go through `viewport.ts` before touching the 0..1 layout, so a gesture
 * means the same thing at 25% zoom as at 400%. Nothing here mutates the
 * draft — every gesture emits geometry for the caller to commit, which is
 * what makes undo a single snapshot push per gesture.
 *
 * `container-type: size` on the surface is what makes the `cqh`
 * (container-query height) units in `squareToStyle` and the font sizes
 * resolve — see `geometry.ts` for why that unit specifically.
 *
 * Must be rendered inside the `TemplateDesigner`'s `DndContext`: it is the
 * drop target for palette chips and listens for their drop via
 * `useDndMonitor`, which throws outside one.
 */
export function DesignerCanvas({
  imageUrl,
  canvasWidth,
  canvasHeight,
  draft,
  order,
  selectedIds,
  onSelectionChange,
  viewport,
  onGeometryChange,
  onNudge,
  sampleValues,
  signerPreviews,
  armedId,
  onPlace,
  onCancelPlacement,
  guides,
}: DesignerCanvasProps): React.JSX.Element {
  const { t } = useT();
  const [surfaceEl, setSurfaceEl] = useState<HTMLDivElement | null>(null);
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const [ghost, setGhost] = useState<FracPoint | null>(null);
  const moveableRef = useRef<Moveable>(null);
  const gestureRef = useRef<{
    key: string;
    start: Map<string, BoxGeometry>;
  } | null>(null);
  const gestureCount = useRef(0);

  const aspect = canvasWidth / canvasHeight;
  const { widthPx, heightPx } = surfaceSizePx(viewport);
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: CANVAS_DROPPABLE_ID,
  });

  const layers = useMemo(() => orderedLayers(draft, order), [draft, order]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const primaryId = selectedIds[selectedIds.length - 1] ?? null;

  const surfaceOrigin = useCallback((): { left: number; top: number } => {
    const rect = surfaceEl?.getBoundingClientRect();
    return { left: rect?.left ?? 0, top: rect?.top ?? 0 };
  }, [surfaceEl]);

  // react-moveable needs the live DOM nodes, not ids. Re-resolved whenever the
  // selection or the set of boxes changes; `layers` covers a signature box
  // appearing or disappearing under the current selection.
  useEffect(() => {
    if (!surfaceEl) {
      setTargets([]);
      return;
    }
    const next = selectedIds
      .map((id) =>
        surfaceEl.querySelector<HTMLElement>(`[data-designer-box="${id}"]`),
      )
      .filter((element): element is HTMLElement => element !== null);
    setTargets(next);
  }, [surfaceEl, selectedIds, layers]);

  // Handles are positioned from a cached rect. Panel edits, nudges, undo and
  // zoom all move boxes without a pointer, so re-measure after those — but
  // never mid-gesture, where moveable is authoritative and a re-measure would
  // fight the drag it is currently driving.
  useEffect(() => {
    if (gestureRef.current) return;
    moveableRef.current?.updateRect();
  }, [draft, viewport, targets]);

  const beginGesture = useCallback(
    (ids: string[]): void => {
      const start = new Map<string, BoxGeometry>();
      for (const id of ids) {
        const selection = parseSelectionId(id);
        const geometry = selection ? boxGeometry(draft, selection) : null;
        if (geometry) start.set(id, geometry);
      }
      gestureCount.current += 1;
      gestureRef.current = { key: `gesture:${gestureCount.current}`, start };
    },
    [draft],
  );

  const endGesture = useCallback((): void => {
    gestureRef.current = null;
  }, []);

  const handleDragStart = useCallback(
    (e: OnDragStart | OnResizeStart): void => {
      const id = boxIdOf(e.target);
      if (id) beginGesture([id]);
    },
    [beginGesture],
  );

  const handleDrag = useCallback(
    (e: OnDrag): void => {
      const gesture = gestureRef.current;
      const id = boxIdOf(e.target);
      const start = id ? gesture?.start.get(id) : undefined;
      if (!gesture || !id || !start) return;
      const { dx, dy } = screenDeltaToFrac(
        e.beforeTranslate[0],
        e.beforeTranslate[1],
        viewport,
      );
      onGeometryChange(
        [{ id, geometry: translateGeometry(start, dx, dy, aspect) }],
        gesture.key,
      );
    },
    [aspect, onGeometryChange, viewport],
  );

  const handleResize = useCallback(
    (e: OnResize): void => {
      const gesture = gestureRef.current;
      const id = boxIdOf(e.target);
      const start = id ? gesture?.start.get(id) : undefined;
      if (!gesture || !id || !start || widthPx <= 0 || heightPx <= 0) return;
      const { dx, dy } = screenDeltaToFrac(
        e.drag.beforeTranslate[0],
        e.drag.beforeTranslate[1],
        viewport,
      );
      const geometry: BoxGeometry =
        start.kind === "square"
          ? {
              kind: "square",
              square: resizeSquareTo(
                start.square,
                dx,
                dy,
                e.height / heightPx,
                aspect,
              ),
            }
          : {
              kind: "rect",
              rect: resizeRectTo(
                start.rect,
                dx,
                dy,
                e.width / widthPx,
                e.height / heightPx,
              ),
            };
      onGeometryChange([{ id, geometry }], gesture.key);
    },
    [aspect, heightPx, onGeometryChange, viewport, widthPx],
  );

  const handleDragGroupStart = useCallback((): void => {
    beginGesture(selectedIds);
  }, [beginGesture, selectedIds]);

  const handleDragGroup = useCallback(
    (e: OnDragGroup): void => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const { dx, dy } = screenDeltaToFrac(
        e.beforeTranslate[0],
        e.beforeTranslate[1],
        viewport,
      );
      const changes: BoxGeometryChange[] = [...gesture.start].map(
        ([id, start]) => ({
          id,
          geometry: translateGeometry(start, dx, dy, aspect),
        }),
      );
      onGeometryChange(changes, gesture.key);
    },
    [aspect, onGeometryChange, viewport],
  );

  const handleSelect = useCallback(
    (id: string, additive: boolean): void => {
      if (!additive) {
        if (selectedIds.length === 1 && selectedIds[0] === id) return;
        onSelectionChange([id]);
        return;
      }
      onSelectionChange(
        selected.has(id)
          ? selectedIds.filter((entry) => entry !== id)
          : [...selectedIds, id],
      );
    },
    [onSelectionChange, selected, selectedIds],
  );

  const placeAt = useCallback(
    (clientX: number, clientY: number): void => {
      if (!armedId) return;
      onPlace(
        armedId,
        clientPointToFrac({ clientX, clientY }, surfaceOrigin(), viewport),
      );
      setGhost(null);
    },
    [armedId, onPlace, surfaceOrigin, viewport],
  );

  // A palette chip dragged onto the canvas lands where it was dropped. dnd-kit
  // reports the dragged chip's own translated rect rather than a pointer
  // position, so its centre is the drop point.
  useDndMonitor({
    onDragEnd: (event) => {
      const rect = event.active.rect.current.translated;
      if (!rect || event.over?.id !== CANVAS_DROPPABLE_ID) return;
      const id = String(event.active.id);
      onPlace(
        id,
        clientPointToFrac(
          {
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          },
          surfaceOrigin(),
          viewport,
        ),
      );
    },
  });

  const verticalGuidelines = useMemo(
    () => guides.vertical.map((value) => value * widthPx),
    [guides.vertical, widthPx],
  );
  const horizontalGuidelines = useMemo(
    () => guides.horizontal.map((value) => value * heightPx),
    [guides.horizontal, heightPx],
  );

  const singleTarget = targets.length === 1 ? targets[0] : null;
  const singleSelection = singleTarget
    ? parseSelectionId(boxIdOf(singleTarget) ?? "")
    : null;
  // The QR must stay square through a resize; every other box is free-form.
  const isSquareTarget =
    singleSelection !== null && isSquareSelection(singleSelection);

  return (
    <div
      ref={(element) => {
        setSurfaceEl(element);
        setDroppableRef(element);
      }}
      data-designer-surface=""
      className={cn(SURFACE_CLASS, armedId && "cursor-crosshair")}
      style={{ width: widthPx, height: heightPx, containerType: "size" }}
      onPointerMove={(e) => {
        if (!armedId) return;
        setGhost(
          clientPointToFrac(
            { clientX: e.clientX, clientY: e.clientY },
            surfaceOrigin(),
            viewport,
          ),
        );
      }}
      onPointerLeave={() => setGhost(null)}
      onPointerDown={(e) => {
        if (!armedId) return;
        e.preventDefault();
        placeAt(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && armedId) {
          e.preventDefault();
          onCancelPlacement();
          setGhost(null);
        }
      }}
    >
      <style>{MOVEABLE_TOUCH_CSS}</style>

      {/* eslint-disable-next-line @next/next/no-img-element -- data URI / Supabase-hosted upload, not a static/local asset */}
      <img
        src={imageUrl}
        alt={t("designer.canvas.templateAlt")}
        className="pointer-events-none absolute inset-0 size-full rounded-lg object-fill"
        draggable={false}
      />

      {layers.map((layer, index) => {
        const { id, selection } = layer;
        const zIndex = index + 1;
        if (selection.kind === "text") {
          const field = draft.fields[selection.key];
          const text =
            selection.key === "student_name"
              ? sampleValues.studentName
              : selection.key === "date"
                ? sampleValues.dateText
                : sampleValues.certId;
          return (
            <DesignerBox
              key={id}
              id={id}
              label={t(TEXT_FIELD_LABEL_KEYS[selection.key])}
              style={{ ...rectToPercentStyle(field), zIndex }}
              selected={selected.has(id)}
              primary={primaryId === id}
              onSelect={handleSelect}
              onNudge={onNudge}
              inert={armedId !== null}
            >
              <TextFieldContent field={field} text={text} />
            </DesignerBox>
          );
        }
        if (selection.kind === "qr") {
          return (
            <DesignerBox
              key={id}
              id={id}
              label={t("designer.qr.label")}
              style={{ ...squareToStyle(draft.qr), zIndex }}
              selected={selected.has(id)}
              primary={primaryId === id}
              onSelect={handleSelect}
              onNudge={onNudge}
              inert={armedId !== null}
            >
              <QrContent />
            </DesignerBox>
          );
        }
        const box = draft.signatures[selection.index];
        if (!box) return null;
        return (
          <DesignerBox
            key={id}
            id={id}
            label={t("designer.signature.label", {
              index: selection.index + 1,
            })}
            style={{ ...rectToPercentStyle(box), zIndex }}
            selected={selected.has(id)}
            primary={primaryId === id}
            onSelect={handleSelect}
            onNudge={onNudge}
            inert={armedId !== null}
          >
            <SignatureContent
              box={box}
              signer={signerPreviews[selection.index]}
            />
          </DesignerBox>
        );
      })}

      {armedId && ghost && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-ring bg-ring/20"
          style={{
            left: `${ghost.x * 100}%`,
            top: `${ghost.y * 100}%`,
            width: 28,
            height: 28,
          }}
        />
      )}

      {surfaceEl && (
        <>
          <Moveable
            ref={moveableRef}
            className="designer-moveable"
            target={armedId ? [] : (singleTarget ?? targets)}
            container={surfaceEl}
            draggable
            resizable={targets.length === 1}
            keepRatio={isSquareTarget}
            origin={false}
            hideDefaultLines={false}
            throttleDrag={0}
            throttleResize={0}
            zoom={1.4}
            snappable
            snapThreshold={8}
            snapDirections={{
              top: true,
              left: true,
              bottom: true,
              right: true,
              center: true,
              middle: true,
            }}
            elementSnapDirections={{
              top: true,
              left: true,
              bottom: true,
              right: true,
              center: true,
              middle: true,
            }}
            elementGuidelines={layers
              .filter((layer) => !selected.has(layer.id))
              .map((layer) => `[data-designer-box="${layer.id}"]`)}
            verticalGuidelines={verticalGuidelines}
            horizontalGuidelines={horizontalGuidelines}
            bounds={{
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              position: "css",
            }}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={endGesture}
            onResizeStart={handleDragStart}
            onResize={handleResize}
            onResizeEnd={endGesture}
            onDragGroupStart={handleDragGroupStart}
            onDragGroup={handleDragGroup}
            onDragGroupEnd={endGesture}
          />
          <Selecto
            dragContainer={surfaceEl}
            selectableTargets={["[data-designer-box]"]}
            hitRate={0}
            selectByClick={false}
            selectFromInside={false}
            toggleContinueSelect={["shift"]}
            preventDefault
            onDragStart={(e) => {
              const target = e.inputEvent?.target as HTMLElement | null;
              if (
                armedId ||
                target?.closest("[data-designer-box]") ||
                target?.closest(".moveable-control-box")
              ) {
                e.stop();
              }
            }}
            onSelectEnd={(e) => {
              const ids = e.selected
                .map((element) => boxIdOf(element))
                .filter((id): id is string => id !== null);
              onSelectionChange(ids);
            }}
          />
        </>
      )}
    </div>
  );
}
