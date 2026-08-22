// Screen <-> normalized conversion for a zoomable canvas. `geometry.ts` owns
// the 0..1 layout math and knows nothing about the screen; this module owns
// the one thing that sits between them — how many CSS pixels one unit of
// fraction is currently worth.
//
// Zoom is implemented by rendering the canvas surface at a real pixel size
// (`baseWidthPx * zoom`) rather than by CSS-transforming it, so
// `getBoundingClientRect()`, react-moveable's deltas and the boxes' own
// percentage styles all stay truthful at any zoom. That makes `zoom` a plain
// multiplier on the base size here, and every conversion below routes
// through `surfaceSizePx` so none of them can forget it.

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** The steps the +/- buttons walk through. Ascending, must include 1 (fit). */
export const ZOOM_STEPS: readonly number[] = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4,
];

export interface CanvasViewport {
  /** CSS width the canvas surface occupies at zoom 1 — i.e. fitted to its column. */
  baseWidthPx: number;
  /** CSS height at zoom 1; always `baseWidthPx / aspect`, kept explicit so callers can't drift. */
  baseHeightPx: number;
  zoom: number;
}

export interface FracPoint {
  x: number;
  y: number;
}

export interface PxPoint {
  xPx: number;
  yPx: number;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Actual rendered size of the canvas surface — the denominator of every conversion below. */
export function surfaceSizePx(viewport: CanvasViewport): {
  widthPx: number;
  heightPx: number;
} {
  const zoom = clampZoom(viewport.zoom);
  return {
    widthPx: viewport.baseWidthPx * zoom,
    heightPx: viewport.baseHeightPx * zoom,
  };
}

/**
 * A pointer/drag delta in CSS px -> the same delta in layout fractions.
 * Returns zeros for a degenerate surface (pre-layout, width 0) so callers
 * can't produce NaN geometry, matching `geometry.ts`'s guard convention.
 */
export function screenDeltaToFrac(
  dxPx: number,
  dyPx: number,
  viewport: CanvasViewport,
): { dx: number; dy: number } {
  const { widthPx, heightPx } = surfaceSizePx(viewport);
  if (widthPx <= 0 || heightPx <= 0) return { dx: 0, dy: 0 };
  return { dx: dxPx / widthPx, dy: dyPx / heightPx };
}

/** Inverse of `screenDeltaToFrac` — used to size drag ghosts and snap thresholds. */
export function fracDeltaToScreenPx(
  dx: number,
  dy: number,
  viewport: CanvasViewport,
): PxPoint {
  const { widthPx, heightPx } = surfaceSizePx(viewport);
  return { xPx: dx * widthPx, yPx: dy * heightPx };
}

/**
 * An absolute viewport point (a `pointerdown`'s clientX/clientY) -> layout
 * fractions, given the surface's own top-left in the same client space.
 * Deliberately takes the origin only, never the rect's size: size comes from
 * the viewport so a stale/animating rect can't silently change the mapping.
 * Not clamped — callers decide whether an out-of-bounds drop is a miss or
 * something to clamp into range.
 */
export function clientPointToFrac(
  point: { clientX: number; clientY: number },
  origin: { left: number; top: number },
  viewport: CanvasViewport,
): FracPoint {
  const { widthPx, heightPx } = surfaceSizePx(viewport);
  if (widthPx <= 0 || heightPx <= 0) return { x: 0, y: 0 };
  return {
    x: (point.clientX - origin.left) / widthPx,
    y: (point.clientY - origin.top) / heightPx,
  };
}

/** Inverse of `clientPointToFrac`, for positioning the placement ghost. */
export function fracPointToClient(
  frac: FracPoint,
  origin: { left: number; top: number },
  viewport: CanvasViewport,
): { clientX: number; clientY: number } {
  const { widthPx, heightPx } = surfaceSizePx(viewport);
  return {
    clientX: origin.left + frac.x * widthPx,
    clientY: origin.top + frac.y * heightPx,
  };
}

/** A px length measured on screen -> fraction of canvas width (snap thresholds, min sizes). */
export function pxToFracWidth(px: number, viewport: CanvasViewport): number {
  const { widthPx } = surfaceSizePx(viewport);
  return widthPx <= 0 ? 0 : px / widthPx;
}

export function pxToFracHeight(px: number, viewport: CanvasViewport): number {
  const { heightPx } = surfaceSizePx(viewport);
  return heightPx <= 0 ? 0 : px / heightPx;
}

function stepZoom(zoom: number, direction: 1 | -1): number {
  const current = clampZoom(zoom);
  const steps = direction === 1 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  const epsilon = 1e-6;
  const next = steps.find((step) =>
    direction === 1 ? step > current + epsilon : step < current - epsilon,
  );
  return next === undefined ? current : next;
}

export function zoomIn(zoom: number): number {
  return stepZoom(zoom, 1);
}

export function zoomOut(zoom: number): number {
  return stepZoom(zoom, -1);
}

/**
 * The zoom at which one template pixel renders as one CSS pixel — what a
 * "100%" button means for an uploaded image, as opposed to "fit" (zoom 1).
 */
export function naturalZoom(imageWidthPx: number, baseWidthPx: number): number {
  if (baseWidthPx <= 0 || imageWidthPx <= 0) return 1;
  return clampZoom(imageWidthPx / baseWidthPx);
}
