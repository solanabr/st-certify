import { describe, it, expect } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEPS,
  clampZoom,
  clientPointToFrac,
  fracDeltaToScreenPx,
  fracPointToClient,
  naturalZoom,
  pxToFracHeight,
  pxToFracWidth,
  screenDeltaToFrac,
  surfaceSizePx,
  zoomIn,
  zoomOut,
  type CanvasViewport,
} from "../viewport";

/** 1600x1131 (the A4-landscape-ish template ratio) fitted to an 800px column. */
function viewport(zoom: number): CanvasViewport {
  return { baseWidthPx: 800, baseHeightPx: 565.5, zoom };
}

describe("clampZoom", () => {
  it("bounds zoom into [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });

  it("falls back to fit for non-finite input rather than poisoning the math", () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("surfaceSizePx", () => {
  it("scales the base size by zoom", () => {
    expect(surfaceSizePx(viewport(1))).toEqual({
      widthPx: 800,
      heightPx: 565.5,
    });
    expect(surfaceSizePx(viewport(2))).toEqual({
      widthPx: 1600,
      heightPx: 1131,
    });
    expect(surfaceSizePx(viewport(0.5))).toEqual({
      widthPx: 400,
      heightPx: 282.75,
    });
  });

  it("clamps an out-of-range zoom before scaling", () => {
    expect(surfaceSizePx(viewport(100)).widthPx).toBe(800 * MAX_ZOOM);
  });
});

describe("screenDeltaToFrac", () => {
  it("converts a px drag delta into layout fractions at zoom 1", () => {
    const { dx, dy } = screenDeltaToFrac(80, 56.55, viewport(1));
    expect(dx).toBeCloseTo(0.1);
    expect(dy).toBeCloseTo(0.1);
  });

  it("halves the fraction when zoomed 2x — the same finger travel moves the box less", () => {
    const atOne = screenDeltaToFrac(80, 80, viewport(1));
    const atTwo = screenDeltaToFrac(80, 80, viewport(2));
    expect(atTwo.dx).toBeCloseTo(atOne.dx / 2);
    expect(atTwo.dy).toBeCloseTo(atOne.dy / 2);
    expect(atTwo.dx).toBeCloseTo(0.05);
  });

  it("doubles the fraction when zoomed out to 0.5", () => {
    expect(screenDeltaToFrac(80, 0, viewport(0.5)).dx).toBeCloseTo(0.2);
  });

  it("keeps direction — negative deltas stay negative", () => {
    const { dx, dy } = screenDeltaToFrac(-80, -56.55, viewport(1));
    expect(dx).toBeCloseTo(-0.1);
    expect(dy).toBeCloseTo(-0.1);
  });

  it("returns zeros instead of NaN/Infinity before layout has measured the canvas", () => {
    const unmeasured: CanvasViewport = {
      baseWidthPx: 0,
      baseHeightPx: 0,
      zoom: 1,
    };
    expect(screenDeltaToFrac(50, 50, unmeasured)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("fracDeltaToScreenPx", () => {
  it("is the exact inverse of screenDeltaToFrac at any zoom", () => {
    for (const zoom of [0.25, 0.5, 1, 1.5, 2, 4]) {
      const vp = viewport(zoom);
      const { dx, dy } = screenDeltaToFrac(123, 45, vp);
      const back = fracDeltaToScreenPx(dx, dy, vp);
      expect(back.xPx).toBeCloseTo(123);
      expect(back.yPx).toBeCloseTo(45);
    }
  });
});

describe("clientPointToFrac", () => {
  const origin = { left: 40, top: 100 };

  it("maps the surface's corners to 0 and 1 at zoom 1", () => {
    const vp = viewport(1);
    expect(
      clientPointToFrac({ clientX: 40, clientY: 100 }, origin, vp),
    ).toEqual({ x: 0, y: 0 });

    const bottomRight = clientPointToFrac(
      { clientX: 40 + 800, clientY: 100 + 565.5 },
      origin,
      vp,
    );
    expect(bottomRight.x).toBeCloseTo(1);
    expect(bottomRight.y).toBeCloseTo(1);
  });

  it("maps the centre to 0.5 regardless of zoom", () => {
    for (const zoom of [0.5, 1, 2, 4]) {
      const vp = viewport(zoom);
      const { widthPx, heightPx } = surfaceSizePx(vp);
      const centre = clientPointToFrac(
        {
          clientX: origin.left + widthPx / 2,
          clientY: origin.top + heightPx / 2,
        },
        origin,
        vp,
      );
      expect(centre.x).toBeCloseTo(0.5);
      expect(centre.y).toBeCloseTo(0.5);
    }
  });

  it("accounts for zoom — the same client point is a different fraction when zoomed in", () => {
    const point = { clientX: 40 + 400, clientY: 100 + 282.75 };
    expect(clientPointToFrac(point, origin, viewport(1)).x).toBeCloseTo(0.5);
    expect(clientPointToFrac(point, origin, viewport(2)).x).toBeCloseTo(0.25);
  });

  it("does not clamp — a point past the surface reports > 1 so callers can treat it as a miss", () => {
    const outside = clientPointToFrac(
      { clientX: 40 + 1200, clientY: 100 - 50 },
      origin,
      viewport(1),
    );
    expect(outside.x).toBeGreaterThan(1);
    expect(outside.y).toBeLessThan(0);
  });

  it("round-trips through fracPointToClient at any zoom", () => {
    for (const zoom of [0.25, 1, 2.5, 4]) {
      const vp = viewport(zoom);
      const frac = { x: 0.37, y: 0.82 };
      const client = fracPointToClient(frac, origin, vp);
      const back = clientPointToFrac(client, origin, vp);
      expect(back.x).toBeCloseTo(frac.x);
      expect(back.y).toBeCloseTo(frac.y);
    }
  });

  it("returns the origin fraction instead of NaN for an unmeasured canvas", () => {
    const unmeasured: CanvasViewport = {
      baseWidthPx: 0,
      baseHeightPx: 0,
      zoom: 1,
    };
    expect(
      clientPointToFrac({ clientX: 10, clientY: 10 }, origin, unmeasured),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe("pxToFracWidth / pxToFracHeight", () => {
  it("shrinks a fixed px threshold as zoom grows", () => {
    expect(pxToFracWidth(8, viewport(1))).toBeCloseTo(0.01);
    expect(pxToFracWidth(8, viewport(2))).toBeCloseTo(0.005);
    expect(pxToFracHeight(56.55, viewport(1))).toBeCloseTo(0.1);
  });

  it("returns 0 for an unmeasured canvas", () => {
    const unmeasured: CanvasViewport = {
      baseWidthPx: 0,
      baseHeightPx: 0,
      zoom: 1,
    };
    expect(pxToFracWidth(8, unmeasured)).toBe(0);
    expect(pxToFracHeight(8, unmeasured)).toBe(0);
  });
});

describe("zoomIn / zoomOut", () => {
  it("walks the declared steps", () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.75);
    expect(zoomIn(0.25)).toBe(0.5);
  });

  it("saturates at the ends instead of leaving the range", () => {
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
  });

  it("snaps an off-step zoom onto the next step in the requested direction", () => {
    expect(zoomIn(1.1)).toBe(1.25);
    expect(zoomOut(1.1)).toBe(1);
  });

  it("declares steps that stay inside the clamp range and include fit", () => {
    expect(ZOOM_STEPS).toContain(1);
    expect(Math.min(...ZOOM_STEPS)).toBe(MIN_ZOOM);
    expect(Math.max(...ZOOM_STEPS)).toBe(MAX_ZOOM);
  });
});

describe("naturalZoom", () => {
  it("is the ratio of template pixels to fitted CSS pixels", () => {
    expect(naturalZoom(1600, 800)).toBe(2);
    expect(naturalZoom(800, 800)).toBe(1);
  });

  it("clamps a huge template into the allowed zoom range", () => {
    expect(naturalZoom(24_000, 800)).toBe(MAX_ZOOM);
  });

  it("falls back to 1 for a degenerate measurement", () => {
    expect(naturalZoom(1600, 0)).toBe(1);
    expect(naturalZoom(0, 800)).toBe(1);
  });
});
