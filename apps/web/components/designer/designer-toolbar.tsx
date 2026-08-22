"use client";

import { Maximize2, Minus, Plus, Redo2, Scan, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export interface DesignerToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onActualSize: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Zoom and history controls. Both are also keyboard shortcuts on the canvas,
 * but neither may be shortcut-only: the shortcuts are unreachable on the
 * tablets this designer is built for, and undo with no visible affordance is
 * undiscoverable everywhere.
 */
export function DesignerToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onActualSize,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: DesignerToolbarProps): React.JSX.Element {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label={t("designer.toolbar.undo")}
        title={t("designer.toolbar.undo")}
      >
        <Undo2 className="size-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label={t("designer.toolbar.redo")}
        title={t("designer.toolbar.redo")}
      >
        <Redo2 className="size-4" aria-hidden="true" />
      </Button>

      <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        onClick={onZoomOut}
        aria-label={t("designer.toolbar.zoomOut")}
        title={t("designer.toolbar.zoomOut")}
      >
        <Minus className="size-4" aria-hidden="true" />
      </Button>
      <output
        className="min-w-14 text-center text-sm tabular-nums text-muted-foreground"
        aria-label={t("designer.toolbar.zoomLevel")}
      >
        {Math.round(zoom * 100)}%
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        onClick={onZoomIn}
        aria-label={t("designer.toolbar.zoomIn")}
        title={t("designer.toolbar.zoomIn")}
      >
        <Plus className="size-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 gap-1.5"
        onClick={onFit}
      >
        <Maximize2 className="size-4" aria-hidden="true" />
        {t("designer.toolbar.fit")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 gap-1.5"
        onClick={onActualSize}
      >
        <Scan className="size-4" aria-hidden="true" />
        {t("designer.toolbar.actualSize")}
      </Button>
    </div>
  );
}
