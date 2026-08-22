"use client";

import Guides from "@scena/react-guides";

/** Ruler thickness, in px. Also the size of the corner square between them. */
const RULER_SIZE = 20;

export interface CanvasGuides {
  /** Vertical guide lines, as 0..1 fractions of canvas width. */
  vertical: number[];
  /** Horizontal guide lines, as 0..1 fractions of canvas height. */
  horizontal: number[];
}

export interface CanvasRulersProps {
  /** Rendered surface size at the current zoom, in CSS px. */
  widthPx: number;
  heightPx: number;
  guides: CanvasGuides;
  onGuidesChange: (guides: CanvasGuides) => void;
  /**
   * Attached to a zero-height probe inside the padded content box, so the
   * caller measures the width actually available to the canvas — with the
   * rulers' gutter already subtracted at whatever breakpoint is live.
   */
  contentRef?: (element: HTMLDivElement | null) => void;
  children: React.ReactNode;
}

/**
 * Percentage rulers along the top and left edge, with draggable alignment
 * guides that react-moveable snaps to.
 *
 * The rulers are labelled in percent rather than pixels because that is the
 * unit the layout is actually stored in — a px reading would be a different
 * number at every zoom level and would not match anything in the field-editor
 * panel. That makes the ruler's own `zoom` (px per displayed unit) simply
 * "how many px one percent is", which differs between the two axes whenever
 * the template isn't square, hence two independently configured instances.
 *
 * Guides are view state, never persisted: they are scaffolding for
 * positioning, not part of the certificate.
 */
export function CanvasRulers({
  widthPx,
  heightPx,
  guides,
  onGuidesChange,
  contentRef,
  children,
}: CanvasRulersProps): React.JSX.Element {
  const horizontalZoom = widthPx / 100;
  const verticalZoom = heightPx / 100;
  const rulerTheme = {
    backgroundColor: "transparent",
    lineColor: "rgba(255,255,255,0.25)",
    textColor: "rgba(255,255,255,0.55)",
  } as const;

  return (
    // Rulers are a pointer-precision aid on a large screen; below `md` they
    // would eat scarce width, so only the padding and the strips drop out —
    // the canvas itself renders identically at every breakpoint.
    <div className="relative md:pt-5 md:pl-5">
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 hidden rounded-tl-md border-r border-b border-border bg-muted/30 md:block"
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      />

      {/*
        Remounted on a size change (via `key`) instead of held by a ref and
        told to `resize()`: the guides themselves live in this component's
        props, so a remount is lossless, and it keeps the zoom/size handling
        in one place.
      */}
      <div
        aria-hidden="true"
        className="absolute top-0 hidden overflow-hidden border-b border-border md:block"
        style={{ left: RULER_SIZE, width: widthPx, height: RULER_SIZE }}
      >
        <Guides
          key={`h-${Math.round(widthPx)}`}
          type="horizontal"
          zoom={horizontalZoom > 0 ? horizontalZoom : 1}
          unit={10}
          displayDragPos
          defaultGuides={guides.vertical.map((value) => value * 100)}
          onChangeGuides={(e) =>
            onGuidesChange({
              ...guides,
              vertical: e.guides.map((value) => value / 100),
            })
          }
          rulerStyle={{ width: "100%", height: `${RULER_SIZE}px` }}
          {...rulerTheme}
        />
      </div>

      <div
        aria-hidden="true"
        className="absolute left-0 hidden overflow-hidden border-r border-border md:block"
        style={{ top: RULER_SIZE, width: RULER_SIZE, height: heightPx }}
      >
        <Guides
          key={`v-${Math.round(heightPx)}`}
          type="vertical"
          zoom={verticalZoom > 0 ? verticalZoom : 1}
          unit={10}
          displayDragPos
          defaultGuides={guides.horizontal.map((value) => value * 100)}
          onChangeGuides={(e) =>
            onGuidesChange({
              ...guides,
              horizontal: e.guides.map((value) => value / 100),
            })
          }
          rulerStyle={{ width: `${RULER_SIZE}px`, height: "100%" }}
          {...rulerTheme}
        />
      </div>

      <div ref={contentRef} className="h-0" aria-hidden="true" />
      {children}
    </div>
  );
}
