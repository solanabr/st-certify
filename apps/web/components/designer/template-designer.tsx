"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useT } from "@/lib/i18n";
import type { QrField, SignatureBox, TextField } from "@/lib/render/layout";
import {
  centerRectAt,
  centerSquareAt,
  nudgeRect,
  nudgeSquare,
} from "./geometry";
import {
  applyBoxGeometry,
  boxGeometry,
  type BoxGeometryChange,
} from "./box-geometry";
import {
  moveLayer,
  orderedLayers,
  parseSelectionId,
  reconcileOrder,
  type DesignerLayer,
} from "./layers";
import {
  clampZoom,
  naturalZoom,
  surfaceSizePx,
  zoomIn,
  zoomOut,
  type CanvasViewport,
  type FracPoint,
} from "./viewport";
import { useDesignerHistory } from "./use-designer-history";
import {
  DesignerCanvas,
  TEXT_FIELD_LABEL_KEYS,
  type SamplePreviewValues,
  type SignaturePreview,
} from "./designer-canvas";
import { CanvasRulers, type CanvasGuides } from "./canvas-rulers";
import { DesignerToolbar } from "./designer-toolbar";
import { DesignerPalette } from "./palette";
import { FieldEditorPanel } from "./field-editor-panel";
import { LayerList } from "./layer-list";
import {
  selectionId,
  type DesignerLayoutDraft,
  type SelectedBox,
  type TextFieldKey,
} from "./types";

export interface TemplateDesignerProps {
  imageUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  draft: DesignerLayoutDraft;
  onDraftChange: (next: DesignerLayoutDraft) => void;
  /** The box the field-editor panel edits; owned by the wizard so it survives a remount. */
  selected: SelectedBox | null;
  onSelectedChange: (selection: SelectedBox | null) => void;
  sampleValues: SamplePreviewValues;
  signerPreviews: SignaturePreview[];
}

/**
 * The template designer: toolbar, palette, canvas, layer list and the
 * field-editor panel, plus the state that has to be shared between them
 * (zoom, multi-selection, stacking order, guides, undo/redo).
 *
 * The draft itself is NOT owned here — the wizard holds it, because this
 * whole subtree unmounts whenever the admin steps back to fix a signer. What
 * lives here is everything that is cheap to rebuild and meaningless outside a
 * design session.
 */
export function TemplateDesigner({
  imageUrl,
  canvasWidth,
  canvasHeight,
  draft,
  onDraftChange,
  selected,
  onSelectedChange,
  sampleValues,
  signerPreviews,
}: TemplateDesignerProps): React.JSX.Element {
  const { t } = useT();
  const [columnEl, setColumnEl] = useState<HTMLDivElement | null>(null);
  const [columnWidth, setColumnWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [order, setOrder] = useState<string[]>(() => reconcileOrder([], draft));
  const [guides, setGuides] = useState<CanvasGuides>({
    vertical: [],
    horizontal: [],
  });
  const [armedId, setArmedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const history = useDesignerHistory(draft, onDraftChange);
  const { commit, undo, redo } = history;

  const aspect = canvasWidth / canvasHeight;
  const selectedIds = useMemo(
    () => (selected ? [selectionId(selected)] : []),
    [selected],
  );
  // Multi-selection is designer-local: the field-editor panel edits exactly
  // one box, so only the primary selection is lifted to the wizard.
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const allSelectedIds = useMemo(
    () => [
      ...extraIds.filter((id) => !selectedIds.includes(id)),
      ...selectedIds,
    ],
    [extraIds, selectedIds],
  );

  // The canvas fits its column at zoom 1; everything above that scrolls.
  useEffect(() => {
    if (!columnEl) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setColumnWidth(width);
    });
    observer.observe(columnEl);
    setColumnWidth(columnEl.clientWidth);
    return () => observer.disconnect();
  }, [columnEl]);

  const viewport: CanvasViewport = useMemo(
    () => ({
      baseWidthPx: columnWidth,
      baseHeightPx: aspect > 0 ? columnWidth / aspect : columnWidth,
      zoom,
    }),
    [aspect, columnWidth, zoom],
  );

  useEffect(() => {
    setOrder((previous) => {
      const next = reconcileOrder(previous, draft);
      return next.length === previous.length &&
        next.every((id, index) => id === previous[index])
        ? previous
        : next;
    });
  }, [draft]);

  const surface = useMemo(() => surfaceSizePx(viewport), [viewport]);
  const layers = useMemo(() => orderedLayers(draft, order), [draft, order]);

  const labelFor = useCallback(
    (layer: DesignerLayer): string => {
      const { selection } = layer;
      if (selection.kind === "text") {
        return t(TEXT_FIELD_LABEL_KEYS[selection.key]);
      }
      if (selection.kind === "qr") return t("designer.qr.label");
      return t("designer.signature.label", { index: selection.index + 1 });
    },
    [t],
  );

  const selectIds = useCallback(
    (ids: string[]): void => {
      const primary = ids[ids.length - 1] ?? null;
      setExtraIds(ids.slice(0, -1));
      onSelectedChange(primary ? parseSelectionId(primary) : null);
    },
    [onSelectedChange],
  );

  const handleSelect = useCallback(
    (id: string, additive: boolean): void => {
      if (!additive) {
        selectIds([id]);
        return;
      }
      selectIds(
        allSelectedIds.includes(id)
          ? allSelectedIds.filter((entry) => entry !== id)
          : [...allSelectedIds, id],
      );
    },
    [allSelectedIds, selectIds],
  );

  const applyChanges = useCallback(
    (changes: BoxGeometryChange[], gestureKey: string): void => {
      const next = changes.reduce((accumulated, change) => {
        const selection = parseSelectionId(change.id);
        return selection
          ? applyBoxGeometry(accumulated, selection, change.geometry)
          : accumulated;
      }, draft);
      if (next !== draft) commit(next, gestureKey);
    },
    [commit, draft],
  );

  const handleNudge = useCallback(
    (dxSteps: number, dySteps: number, step: number): void => {
      const changes: BoxGeometryChange[] = [];
      for (const id of allSelectedIds) {
        const selection = parseSelectionId(id);
        const geometry = selection ? boxGeometry(draft, selection) : null;
        if (!geometry) continue;
        changes.push({
          id,
          geometry:
            geometry.kind === "rect"
              ? {
                  kind: "rect",
                  rect: nudgeRect(geometry.rect, dxSteps, dySteps, step),
                }
              : {
                  kind: "square",
                  square: nudgeSquare(
                    geometry.square,
                    dxSteps,
                    dySteps,
                    step,
                    aspect,
                  ),
                },
        });
      }
      // A run of arrow presses in one direction collapses into a single undo
      // step; changing direction starts a new one.
      applyChanges(changes, `nudge:${dxSteps}:${dySteps}:${step}`);
    },
    [allSelectedIds, applyChanges, aspect, draft],
  );

  const placeBox = useCallback(
    (id: string, point: FracPoint): void => {
      const selection = parseSelectionId(id);
      const geometry = selection ? boxGeometry(draft, selection) : null;
      if (!selection || !geometry) return;
      const placed =
        geometry.kind === "rect"
          ? {
              kind: "rect" as const,
              rect: centerRectAt(geometry.rect, point.x, point.y),
            }
          : {
              kind: "square" as const,
              square: centerSquareAt(geometry.square, point.x, point.y, aspect),
            };
      commit(applyBoxGeometry(draft, selection, placed), `place:${id}`);
      setArmedId(null);
      selectIds([id]);
    },
    [aspect, commit, draft, selectIds],
  );

  const updateField = useCallback(
    (key: TextFieldKey, patch: Partial<TextField>): void => {
      commit(
        {
          ...draft,
          fields: {
            ...draft.fields,
            [key]: { ...draft.fields[key], ...patch },
          },
        },
        `panel:text:${key}:${Object.keys(patch).join(",")}`,
      );
    },
    [commit, draft],
  );

  const updateQr = useCallback(
    (patch: Partial<QrField>): void => {
      commit(
        { ...draft, qr: { ...draft.qr, ...patch } },
        `panel:qr:${Object.keys(patch).join(",")}`,
      );
    },
    [commit, draft],
  );

  const updateSignature = useCallback(
    (index: number, patch: Partial<SignatureBox>): void => {
      commit(
        {
          ...draft,
          signatures: draft.signatures.map((box, i) =>
            i === index ? { ...box, ...patch } : box,
          ),
        },
        `panel:sig:${index}:${Object.keys(patch).join(",")}`,
      );
    },
    [commit, draft],
  );

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z, ignored while the admin is typing in the
  // field-editor panel so the browser's own text undo keeps working.
  const historyRef = useRef({ undo, redo });
  useEffect(() => {
    historyRef.current = { undo, redo };
  }, [undo, redo]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setArmedId(null);
        return;
      }
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "z"
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) historyRef.current.redo();
      else historyRef.current.undo();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const draggingLayer = layers.find((layer) => layer.id === draggingId) ?? null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) => {
        setDraggingId(String(event.active.id));
        setArmedId(null);
      }}
      onDragEnd={() => setDraggingId(null)}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className="space-y-4">
        <DesignerToolbar
          zoom={zoom}
          onZoomIn={() => setZoom((z) => zoomIn(z))}
          onZoomOut={() => setZoom((z) => zoomOut(z))}
          onFit={() => setZoom(1)}
          onActualSize={() =>
            setZoom(clampZoom(naturalZoom(canvasWidth, columnWidth)))
          }
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={undo}
          onRedo={redo}
        />

        <div className="grid gap-4 xl:grid-cols-[200px_minmax(0,1fr)_300px]">
          <div className="order-1 space-y-5 xl:order-none">
            <DesignerPalette
              layers={layers}
              labelFor={labelFor}
              armedId={armedId}
              onArm={(id) =>
                setArmedId((current) => (current === id ? null : id))
              }
            />
            <div className="hidden xl:block">
              <LayerList
                layers={layers}
                labelFor={labelFor}
                selectedIds={allSelectedIds}
                onSelect={handleSelect}
                onReorder={(id, toIndex) =>
                  setOrder((previous) => moveLayer(previous, id, toIndex))
                }
              />
            </div>
          </div>

          <div className="order-2 min-w-0 xl:order-none">
            <div className="overflow-auto">
              <CanvasRulers
                widthPx={surface.widthPx}
                heightPx={surface.heightPx}
                guides={guides}
                onGuidesChange={setGuides}
                contentRef={setColumnEl}
              >
                {columnWidth > 0 && (
                  <DesignerCanvas
                    imageUrl={imageUrl}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    draft={draft}
                    order={order}
                    selectedIds={allSelectedIds}
                    onSelectionChange={selectIds}
                    viewport={viewport}
                    onGeometryChange={applyChanges}
                    onNudge={handleNudge}
                    sampleValues={sampleValues}
                    signerPreviews={signerPreviews}
                    armedId={armedId}
                    onPlace={placeBox}
                    onCancelPlacement={() => setArmedId(null)}
                    guides={guides}
                  />
                )}
              </CanvasRulers>
            </div>
          </div>

          <div className="order-3 space-y-5 xl:order-none">
            <FieldEditorPanel
              selected={selected}
              draft={draft}
              aspect={aspect}
              onChangeField={updateField}
              onChangeQr={updateQr}
              onChangeSignature={updateSignature}
            />
            <div className="xl:hidden">
              <LayerList
                layers={layers}
                labelFor={labelFor}
                selectedIds={allSelectedIds}
                onSelect={handleSelect}
                onReorder={(id, toIndex) =>
                  setOrder((previous) => moveLayer(previous, id, toIndex))
                }
              />
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingLayer ? (
          <div className="rounded-md border border-ring bg-background px-3 py-2 text-sm shadow-lg">
            {labelFor(draggingLayer)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
