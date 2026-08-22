"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DesignerLayer } from "./layers";
import { layerIcon } from "./palette";

interface LayerRowProps {
  layer: DesignerLayer;
  label: string;
  selected: boolean;
  onSelect: (id: string, additive: boolean) => void;
}

function LayerRow({
  layer,
  label,
  selected,
  onSelect,
}: LayerRowProps): React.JSX.Element {
  const { t } = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });
  const Icon = layerIcon(layer.selection);

  return (
    <li
      ref={setNodeRef}
      // Y only: a stacking list has no meaningful horizontal axis, and
      // dropping the x component restricts the drag without pulling in
      // @dnd-kit/modifiers.
      style={{
        transform: transform
          ? `translate3d(0, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      className={cn(
        "flex items-center gap-1 rounded-md border bg-background",
        selected ? "border-ring" : "border-transparent",
        isDragging && "z-10 shadow-lg",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={t("designer.layers.reorderAria", { label })}
        className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-pressed={selected}
        onClick={(e) =>
          onSelect(layer.id, e.shiftKey || e.metaKey || e.ctrlKey)
        }
        className={cn(
          "flex min-h-11 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          selected
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
    </li>
  );
}

export interface LayerListProps {
  /** Bottom-first, matching the stacking order. */
  layers: DesignerLayer[];
  labelFor: (layer: DesignerLayer) => string;
  selectedIds: string[];
  onSelect: (id: string, additive: boolean) => void;
  onReorder: (id: string, toIndex: number) => void;
}

/**
 * Stacking order, top of the list = top of the canvas. Reordering here is a
 * designer-only affordance for reaching a box hidden under another — it is
 * not persisted, because the layout schema has no z field and the renderer
 * draws in a fixed order (see `layers.ts`).
 *
 * Signature boxes deliberately keep their numbering: a box's index is the
 * signer it belongs to, so the list can restack them but never renumber them.
 */
export function LayerList({
  layers,
  labelFor,
  selectedIds,
  onSelect,
  onReorder,
}: LayerListProps): React.JSX.Element {
  const { t } = useT();
  // Top of the stack reads first, the way every layers panel does it.
  const topFirst = [...layers].reverse();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const toDisplayIndex = topFirst.findIndex((l) => l.id === over.id);
    if (toDisplayIndex < 0) return;
    // The list renders top-first; the order the caller keeps is bottom-first.
    onReorder(String(active.id), topFirst.length - 1 - toDisplayIndex);
  }

  return (
    <section aria-labelledby="designer-layers-heading" className="space-y-2">
      <h3
        id="designer-layers-heading"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {t("designer.layers.title")}
      </h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={topFirst.map((layer) => layer.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-0.5">
            {topFirst.map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                label={labelFor(layer)}
                selected={selectedIds.includes(layer.id)}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}
