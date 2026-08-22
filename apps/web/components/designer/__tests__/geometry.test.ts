import { describe, it, expect } from "vitest";
import {
  MIN_FRAC,
  NUDGE_STEP,
  NUDGE_STEP_SHIFT,
  clamp,
  round4,
  clampRect,
  clampSquare,
  moveRect,
  resizeRect,
  moveSquare,
  resizeSquare,
  nudgeRect,
  nudgeSquare,
  offsetRect,
  offsetSquare,
  resizeRectTo,
  resizeSquareTo,
  centerRectAt,
  centerSquareAt,
  rectToPercentStyle,
  squareToStyle,
} from "../geometry";

describe("clamp", () => {
  it("bounds a value into [min,max]", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
  });
});

describe("round4", () => {
  it("rounds to 4 decimals", () => {
    expect(round4(0.123456)).toBe(0.1235);
    expect(round4(0.1)).toBe(0.1);
  });
});

describe("clampRect", () => {
  it("passes through an in-bounds rect unchanged", () => {
    const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(clampRect(rect)).toEqual(rect);
  });

  it("keeps x+w and y+h within [0,1] by pulling x/y back, not shrinking w/h", () => {
    const rect = clampRect({ x: 0.9, y: 0.9, w: 0.3, h: 0.3 });
    expect(rect.w).toBe(0.3);
    expect(rect.h).toBe(0.3);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1);
    expect(rect.x).toBeCloseTo(0.7);
    expect(rect.y).toBeCloseTo(0.7);
  });

  it("floors w/h at MIN_FRAC and never lets them go negative or explode past 1", () => {
    const shrunk = clampRect({ x: 0, y: 0, w: -1, h: 0 });
    expect(shrunk.w).toBe(MIN_FRAC);
    expect(shrunk.h).toBe(MIN_FRAC);

    const oversized = clampRect({ x: 0, y: 0, w: 5, h: 5 });
    expect(oversized.w).toBe(1);
    expect(oversized.h).toBe(1);
  });

  it("clamps negative x/y to 0", () => {
    const rect = clampRect({ x: -0.5, y: -0.5, w: 0.2, h: 0.2 });
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
  });
});

describe("clampSquare", () => {
  it("accounts for aspect ratio when bounding x (size is a height-fraction)", () => {
    // canvas 1600x1131 -> aspect ~1.4148; a size=0.2 (of height) square is
    // 0.2/1.4148 ~= 0.1414 of width. Placing it at x=0.95 should be pulled
    // back so x + widthFrac <= 1.
    const aspect = 1600 / 1131;
    const square = clampSquare({ x: 0.95, y: 0, size: 0.2 }, aspect);
    const widthFrac = 0.2 / aspect;
    expect(square.x + widthFrac).toBeLessThanOrEqual(1 + 1e-9);
    expect(square.x).toBeCloseTo(1 - widthFrac);
  });

  it("bounds y directly by size (height-fraction, no aspect conversion needed)", () => {
    const square = clampSquare({ x: 0, y: 0.95, size: 0.3 }, 1);
    expect(square.y).toBeCloseTo(0.7);
  });

  it("floors size at MIN_FRAC", () => {
    const square = clampSquare({ x: 0, y: 0, size: -1 }, 1);
    expect(square.size).toBe(MIN_FRAC);
  });

  it("with aspect=1 (square canvas), behaves like clampRect on x", () => {
    const square = clampSquare({ x: 0.9, y: 0, size: 0.3 }, 1);
    expect(square.x).toBeCloseTo(0.7);
  });
});

describe("moveRect / resizeRect (pointer-delta px -> fraction, round trip)", () => {
  const container = { w: 1000, h: 500 };

  it("moving by a pixel delta converts through the container size", () => {
    const rect = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const moved = moveRect(
      rect,
      { dxPx: 100, dyPx: 50 },
      container.w,
      container.h,
    );
    // 100px / 1000px container = 0.1 frac; 50px / 500px = 0.1 frac
    expect(moved.x).toBeCloseTo(0.2);
    expect(moved.y).toBeCloseTo(0.2);
    expect(moved.w).toBe(rect.w);
    expect(moved.h).toBe(rect.h);
  });

  it("moving is a no-op with a zero-size container (guards div-by-zero)", () => {
    const rect = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    expect(moveRect(rect, { dxPx: 100, dyPx: 50 }, 0, 0)).toEqual(rect);
  });

  it("resizing grows w/h proportionally to the delta and container", () => {
    const rect = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const resized = resizeRect(
      rect,
      { dxPx: 100, dyPx: 50 },
      container.w,
      container.h,
    );
    expect(resized.w).toBeCloseTo(0.3);
    expect(resized.h).toBeCloseTo(0.3);
    expect(resized.x).toBe(rect.x);
    expect(resized.y).toBe(rect.y);
  });

  it("negative delta shrinks but never below MIN_FRAC", () => {
    const rect = { x: 0.1, y: 0.1, w: 0.05, h: 0.05 };
    const resized = resizeRect(
      rect,
      { dxPx: -1000, dyPx: -1000 },
      container.w,
      container.h,
    );
    expect(resized.w).toBe(MIN_FRAC);
    expect(resized.h).toBe(MIN_FRAC);
  });

  it("a full round trip (move then move back) returns to the origin within fp tolerance", () => {
    const rect = { x: 0.3, y: 0.3, w: 0.1, h: 0.1 };
    const there = moveRect(
      rect,
      { dxPx: 137, dyPx: -42 },
      container.w,
      container.h,
    );
    const back = moveRect(
      there,
      { dxPx: -137, dyPx: 42 },
      container.w,
      container.h,
    );
    expect(back.x).toBeCloseTo(rect.x, 10);
    expect(back.y).toBeCloseTo(rect.y, 10);
  });
});

describe("moveSquare / resizeSquare", () => {
  const container = { w: 1600, h: 1131 };
  const aspect = container.w / container.h;

  it("moveSquare converts dx/dy through width/height respectively", () => {
    const square = { x: 0.1, y: 0.1, size: 0.1 };
    const moved = moveSquare(
      square,
      { dxPx: 160, dyPx: 113.1 },
      container.w,
      container.h,
      aspect,
    );
    expect(moved.x).toBeCloseTo(0.2, 3);
    expect(moved.y).toBeCloseTo(0.2, 3);
    expect(moved.size).toBe(square.size);
  });

  it("resizeSquare drives size off dy only, ignoring dx (stays square by construction)", () => {
    const square = { x: 0.1, y: 0.1, size: 0.1 };
    const resized = resizeSquare(
      square,
      { dxPx: 99999, dyPx: 113.1 },
      container.h,
      aspect,
    );
    expect(resized.size).toBeCloseTo(0.2, 3);
  });

  it("resizeSquare no-ops with a zero-height container", () => {
    const square = { x: 0.1, y: 0.1, size: 0.1 };
    expect(resizeSquare(square, { dxPx: 10, dyPx: 10 }, 0, aspect)).toEqual(
      square,
    );
  });
});

describe("nudgeRect / nudgeSquare (WCAG 2.5.7 arrow-key path)", () => {
  it("nudges by exactly NUDGE_STEP per arrow press", () => {
    const rect = { x: 0.5, y: 0.5, w: 0.1, h: 0.1 };
    const right = nudgeRect(rect, 1, 0, NUDGE_STEP);
    expect(right.x).toBeCloseTo(0.505);
    const down = nudgeRect(rect, 0, 1, NUDGE_STEP);
    expect(down.y).toBeCloseTo(0.505);
  });

  it("shift+arrow uses the larger step — 10x the fine one, per Figma", () => {
    const rect = { x: 0.5, y: 0.5, w: 0.1, h: 0.1 };
    const nudged = nudgeRect(rect, 1, 0, NUDGE_STEP_SHIFT);
    expect(NUDGE_STEP_SHIFT).toBeCloseTo(NUDGE_STEP * 10);
    expect(nudged.x).toBeCloseTo(0.5 + NUDGE_STEP_SHIFT);
  });

  it("nudging clamps at the edges instead of leaving the canvas", () => {
    const rect = { x: 0.999, y: 0, w: 0.1, h: 0.1 };
    const nudged = nudgeRect(rect, 1, 0, NUDGE_STEP_SHIFT);
    expect(nudged.x).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it("nudgeSquare respects aspect when nudging x", () => {
    const aspect = 1600 / 1131;
    const square = { x: 0.999, y: 0, size: 0.2 };
    const nudged = nudgeSquare(square, 1, 0, NUDGE_STEP_SHIFT, aspect);
    const widthFrac = 0.2 / aspect;
    expect(nudged.x).toBeCloseTo(1 - widthFrac);
  });
});

describe("rectToPercentStyle / squareToStyle (CSS output)", () => {
  it("rect maps directly to left/top/width/height percentages", () => {
    const style = rectToPercentStyle({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    expect(style).toEqual({
      left: "10%",
      top: "20%",
      width: "30%",
      height: "40%",
    });
  });

  it("square uses cqh for width AND height (both height-relative, per the schema)", () => {
    const style = squareToStyle({ x: 0.1, y: 0.2, size: 0.15 });
    expect(style.left).toBe("10%");
    expect(style.top).toBe("20%");
    expect(style.width).toBe("15cqh");
    expect(style.height).toBe("15cqh");
  });
});

describe("offsetRect / offsetSquare (gesture-relative translation)", () => {
  it("translates by a fraction delta", () => {
    const moved = offsetRect({ x: 0.2, y: 0.3, w: 0.1, h: 0.1 }, 0.05, -0.1);
    expect(moved.x).toBeCloseTo(0.25);
    expect(moved.y).toBeCloseTo(0.2);
  });

  it("clamps into the canvas instead of leaving it", () => {
    const moved = offsetRect({ x: 0.9, y: 0.9, w: 0.2, h: 0.2 }, 0.5, 0.5);
    expect(moved.x).toBeCloseTo(0.8);
    expect(moved.y).toBeCloseTo(0.8);
  });

  it("is what nudgeRect is built from — one step equals one offset", () => {
    const rect = { x: 0.5, y: 0.5, w: 0.1, h: 0.1 };
    expect(nudgeRect(rect, 1, -1, NUDGE_STEP)).toEqual(
      offsetRect(rect, NUDGE_STEP, -NUDGE_STEP),
    );
  });

  it("re-applying a total delta to the gesture-start rect does not drift", () => {
    const start = { x: 0.1, y: 0.1, w: 0.1, h: 0.1 };
    // 100 pointer events' worth of travel, applied as one cumulative offset
    // each time (how the drag path works) — the answer only depends on the
    // total, so intermediate frames can never accumulate error.
    let total = 0;
    let latest = start;
    for (let i = 0; i < 100; i += 1) {
      total += 0.001;
      latest = offsetRect(start, total, 0);
    }
    expect(latest.x).toBeCloseTo(0.2, 10);
  });

  it("offsetSquare respects aspect on the x bound", () => {
    const aspect = 1600 / 1131;
    const moved = offsetSquare({ x: 0.5, y: 0.5, size: 0.2 }, 0.9, 0, aspect);
    expect(moved.x).toBeCloseTo(1 - 0.2 / aspect);
  });
});

describe("resizeRectTo / resizeSquareTo (handle-driven resize)", () => {
  it("sets position and size together from a bottom-right handle", () => {
    const resized = resizeRectTo(
      { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      0,
      0,
      0.5,
      0.4,
    );
    expect(resized).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.4 });
  });

  it("dragging a top-left handle moves the origin and shrinks in one clamp", () => {
    // The failure mode this guards: clamping the translation against the OLD
    // width first would pin x at 1 - 0.5 = 0.5 and lose the resize.
    const resized = resizeRectTo(
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      0.2,
      0.2,
      0.3,
      0.3,
    );
    expect(resized.x).toBeCloseTo(0.7);
    expect(resized.y).toBeCloseTo(0.7);
    expect(resized.w).toBeCloseTo(0.3);
    expect(resized.h).toBeCloseTo(0.3);
  });

  it("floors size at MIN_FRAC and keeps the box on canvas", () => {
    const tiny = resizeRectTo({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0, 0, 0, 0);
    expect(tiny.w).toBe(MIN_FRAC);
    expect(tiny.h).toBe(MIN_FRAC);

    const huge = resizeRectTo(
      { x: 0.9, y: 0.9, w: 0.05, h: 0.05 },
      0,
      0,
      0.5,
      0.5,
    );
    expect(huge.x).toBeCloseTo(0.5);
    expect(huge.y).toBeCloseTo(0.5);
    expect(huge.x + huge.w).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("a square resize takes a single size and stays square", () => {
    const aspect = 1600 / 1131;
    const resized = resizeSquareTo(
      { x: 0.1, y: 0.1, size: 0.1 },
      0.05,
      0.05,
      0.3,
      aspect,
    );
    expect(resized.size).toBeCloseTo(0.3);
    expect(resized.x).toBeCloseTo(0.15);
    expect(resized.y).toBeCloseTo(0.15);
  });

  it("a square resize respects aspect on the x bound", () => {
    const aspect = 2;
    const resized = resizeSquareTo(
      { x: 0.95, y: 0, size: 0.1 },
      0,
      0,
      0.8,
      aspect,
    );
    expect(resized.x).toBeCloseTo(1 - 0.8 / aspect);
  });
});

describe("centerRectAt / centerSquareAt (click-to-place)", () => {
  it("centres a rect on the tapped point", () => {
    const placed = centerRectAt({ x: 0, y: 0, w: 0.2, h: 0.1 }, 0.5, 0.5);
    expect(placed.x).toBeCloseTo(0.4);
    expect(placed.y).toBeCloseTo(0.45);
    expect(placed.w).toBeCloseTo(0.2);
    expect(placed.h).toBeCloseTo(0.1);
  });

  it("clamps a tap near the edge so the whole box stays on canvas", () => {
    const placed = centerRectAt({ x: 0, y: 0, w: 0.4, h: 0.4 }, 0.99, 0.01);
    expect(placed.x).toBeCloseTo(0.6);
    expect(placed.y).toBe(0);
    expect(placed.x + placed.w).toBeLessThanOrEqual(1);
  });

  it("centres a square using its aspect-corrected on-screen width", () => {
    const aspect = 2;
    const placed = centerSquareAt({ x: 0, y: 0, size: 0.4 }, 0.5, 0.5, aspect);
    // Occupies 0.4/2 = 0.2 of the width, so it starts 0.1 left of centre.
    expect(placed.x).toBeCloseTo(0.4);
    expect(placed.y).toBeCloseTo(0.3);
  });

  it("treats a degenerate aspect as square rather than dividing by zero", () => {
    const placed = centerSquareAt({ x: 0, y: 0, size: 0.4 }, 0.5, 0.5, 0);
    expect(placed.x).toBeCloseTo(0.3);
    expect(Number.isFinite(placed.x)).toBe(true);
  });
});
