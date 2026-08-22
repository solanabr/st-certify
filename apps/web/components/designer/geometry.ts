// Pure position/size math for the designer canvas. Nothing here touches the
// DOM — callers supply plain numbers (pointer deltas, container pixel
// dimensions) so this module is unit-testable without jsdom.
//
// Coordinate convention (mirrors `lib/render/layout.ts` exactly): x/w are
// fractions of canvas width, y/h are fractions of canvas height, and a
// square's `size` (qr side length, font size) is ALWAYS a fraction of
// canvas height — even though it renders as a width too. That asymmetry is
// why `clampSquare`/`nudgeSquare` take an `aspect` (canvas.width /
// canvas.height) argument: converting a height-based size into how much
// *width* it occupies requires knowing the canvas's own proportions.

export const MIN_FRAC = 0.02;
export const NUDGE_STEP = 0.005; // 0.5%, arrow key
export const NUDGE_STEP_SHIFT = 0.05; // 5%, shift+arrow — Figma's 10x coarse step

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round-trip-safe display rounding (4 decimals — matches `layout.ts`'s canonical precision, so what you see in the numeric inputs is what gets hashed). */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export interface FracRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FracSquare {
  x: number;
  y: number;
  size: number;
}

export interface PxDelta {
  dxPx: number;
  dyPx: number;
}

/** Keeps a rect fully inside [0,1]x[0,1] and its size at or above the floor. */
export function clampRect(rect: FracRect): FracRect {
  const w = clamp(rect.w, MIN_FRAC, 1);
  const h = clamp(rect.h, MIN_FRAC, 1);
  return {
    w,
    h,
    x: clamp(rect.x, 0, 1 - w),
    y: clamp(rect.y, 0, 1 - h),
  };
}

/**
 * Same as `clampRect` but for a square whose `size` is a height-fraction:
 * the width it occupies (for the x bound) is `size / aspect`, where
 * `aspect = canvas.width / canvas.height`.
 */
export function clampSquare(square: FracSquare, aspect: number): FracSquare {
  const size = clamp(square.size, MIN_FRAC, 1);
  const widthFrac = aspect > 0 ? size / aspect : size;
  return {
    size,
    x: clamp(square.x, 0, 1 - widthFrac),
    y: clamp(square.y, 0, 1 - size),
  };
}

/** Applies an incremental pointer-move delta (CSS px, already the *change* since the last event) to a rect's position, converting via the live container size. */
export function moveRect(
  rect: FracRect,
  delta: PxDelta,
  containerWidthPx: number,
  containerHeightPx: number,
): FracRect {
  if (containerWidthPx <= 0 || containerHeightPx <= 0) return rect;
  return clampRect({
    ...rect,
    x: rect.x + delta.dxPx / containerWidthPx,
    y: rect.y + delta.dyPx / containerHeightPx,
  });
}

/** Applies an incremental resize delta (bottom-right handle convention: dx grows width, dy grows height) to a rect. */
export function resizeRect(
  rect: FracRect,
  delta: PxDelta,
  containerWidthPx: number,
  containerHeightPx: number,
): FracRect {
  if (containerWidthPx <= 0 || containerHeightPx <= 0) return rect;
  return clampRect({
    ...rect,
    w: rect.w + delta.dxPx / containerWidthPx,
    h: rect.h + delta.dyPx / containerHeightPx,
  });
}

export function moveSquare(
  square: FracSquare,
  delta: PxDelta,
  containerWidthPx: number,
  containerHeightPx: number,
  aspect: number,
): FracSquare {
  if (containerWidthPx <= 0 || containerHeightPx <= 0) return square;
  return clampSquare(
    {
      ...square,
      x: square.x + delta.dxPx / containerWidthPx,
      y: square.y + delta.dyPx / containerHeightPx,
    },
    aspect,
  );
}

/** Resize handle drives `size` off the vertical delta only, so a QR box always stays square by construction (matches the renderer using `size` for both width and height off the height basis). */
export function resizeSquare(
  square: FracSquare,
  delta: PxDelta,
  containerHeightPx: number,
  aspect: number,
): FracSquare {
  if (containerHeightPx <= 0) return square;
  return clampSquare(
    { ...square, size: square.size + delta.dyPx / containerHeightPx },
    aspect,
  );
}

/**
 * Translates a box by a delta already expressed in fractions. This is the
 * primitive the gesture-based paths use: a drag converts its total screen
 * travel once (via `viewport.ts`) and re-applies it to the rect captured at
 * gesture start, so a long drag can't accumulate rounding drift the way
 * summing per-event `moveRect` deltas would.
 */
export function offsetRect(rect: FracRect, dx: number, dy: number): FracRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy });
}

export function offsetSquare(
  square: FracSquare,
  dx: number,
  dy: number,
  aspect: number,
): FracSquare {
  return clampSquare({ ...square, x: square.x + dx, y: square.y + dy }, aspect);
}

/**
 * Applies a resize gesture: a handle on any edge or corner changes position
 * AND size together, so both arrive as one already-final rect and get
 * clamped exactly once. Clamping the translation first (with the *old* size)
 * and the size second would wrongly pin a box being dragged open from its
 * left or top edge.
 */
export function resizeRectTo(
  start: FracRect,
  dx: number,
  dy: number,
  w: number,
  h: number,
): FracRect {
  return clampRect({ x: start.x + dx, y: start.y + dy, w, h });
}

export function resizeSquareTo(
  start: FracSquare,
  dx: number,
  dy: number,
  size: number,
  aspect: number,
): FracSquare {
  return clampSquare({ x: start.x + dx, y: start.y + dy, size }, aspect);
}

/** Centres a box on a point — what tapping the canvas in click-to-place mode means. */
export function centerRectAt(rect: FracRect, cx: number, cy: number): FracRect {
  return clampRect({ ...rect, x: cx - rect.w / 2, y: cy - rect.h / 2 });
}

/** Square variant: its on-screen width is `size / aspect` (see `clampSquare`). */
export function centerSquareAt(
  square: FracSquare,
  cx: number,
  cy: number,
  aspect: number,
): FracSquare {
  const widthFrac = aspect > 0 ? square.size / aspect : square.size;
  return clampSquare(
    { ...square, x: cx - widthFrac / 2, y: cy - square.size / 2 },
    aspect,
  );
}

/** Arrow-key nudge (WCAG 2.5.7 drag alternative, on-box variant). `dxSteps`/`dySteps` are -1/0/1; `step` is `NUDGE_STEP` or `NUDGE_STEP_SHIFT`. */
export function nudgeRect(
  rect: FracRect,
  dxSteps: number,
  dySteps: number,
  step: number,
): FracRect {
  return offsetRect(rect, dxSteps * step, dySteps * step);
}

export function nudgeSquare(
  square: FracSquare,
  dxSteps: number,
  dySteps: number,
  step: number,
  aspect: number,
): FracSquare {
  return offsetSquare(square, dxSteps * step, dySteps * step, aspect);
}

/** CSS percentages for a rect box — plain `%` is correct here because `left`/`width` resolve against the container's width and `top`/`height` against its height, which is exactly how x/w and y/h are defined. */
export function rectToPercentStyle(rect: FracRect): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };
}

/**
 * CSS for a square box: `left`/`top` are plain `%` (width/height-relative
 * respectively, matching x/y's definition), but `width`/`height` both need
 * the HEIGHT basis — plain `%` can't express that (a `%` width always
 * resolves against container width). Callers must put `container-type:
 * size` on the canvas wrapper so `cqh` (container-query height) is
 * available; `cqh` is height-relative regardless of which CSS property
 * it's used on, which is exactly the semantics `size` needs.
 */
export function squareToStyle(square: FracSquare): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${square.x * 100}%`,
    top: `${square.y * 100}%`,
    width: `${square.size * 100}cqh`,
    height: `${square.size * 100}cqh`,
  };
}
