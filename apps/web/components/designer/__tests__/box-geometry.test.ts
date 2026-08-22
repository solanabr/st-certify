import { describe, it, expect } from "vitest";
import type { DesignerLayoutDraft, SelectedBox } from "../types";
import {
  applyBoxGeometry,
  boxGeometry,
  isSquareSelection,
} from "../box-geometry";

function draft(): DesignerLayoutDraft {
  return {
    fields: {
      student_name: {
        x: 0.1,
        y: 0.4,
        w: 0.8,
        h: 0.1,
        size: 0.06,
        color: "#FFFFFF",
        align: "center",
        font: "great-vibes",
        weight: 400,
      },
      date: {
        x: 0.1,
        y: 0.52,
        w: 0.8,
        h: 0.04,
        size: 0.02,
        color: "#94A3B8",
        align: "left",
        font: "inter",
        weight: 400,
      },
      cert_id: {
        x: 0.1,
        y: 0.92,
        w: 0.8,
        h: 0.03,
        size: 0.014,
        color: "#94A3B8",
        align: "right",
        font: "inter",
        weight: 600,
      },
    },
    qr: { x: 0.86, y: 0.06, size: 0.1 },
    signatures: [
      { x: 0.06, y: 0.78, w: 0.4, h: 0.12, align: "center" },
      { x: 0.54, y: 0.78, w: 0.4, h: 0.12, align: "left" },
    ],
  };
}

describe("isSquareSelection", () => {
  it("is true only for the QR", () => {
    expect(isSquareSelection({ kind: "qr" })).toBe(true);
    expect(isSquareSelection({ kind: "text", key: "date" })).toBe(false);
    expect(isSquareSelection({ kind: "signature", index: 0 })).toBe(false);
  });
});

describe("boxGeometry", () => {
  it("reads a text field as a rect, without its styling", () => {
    expect(boxGeometry(draft(), { kind: "text", key: "student_name" })).toEqual(
      {
        kind: "rect",
        rect: { x: 0.1, y: 0.4, w: 0.8, h: 0.1 },
      },
    );
  });

  it("reads the QR as a square", () => {
    expect(boxGeometry(draft(), { kind: "qr" })).toEqual({
      kind: "square",
      square: { x: 0.86, y: 0.06, size: 0.1 },
    });
  });

  it("reads a signature box by index", () => {
    expect(boxGeometry(draft(), { kind: "signature", index: 1 })).toEqual({
      kind: "rect",
      rect: { x: 0.54, y: 0.78, w: 0.4, h: 0.12 },
    });
  });

  it("returns null for a signature box that no longer exists", () => {
    expect(boxGeometry(draft(), { kind: "signature", index: 9 })).toBeNull();
  });
});

describe("applyBoxGeometry", () => {
  it("moves a text field and keeps every styling property", () => {
    const before = draft();
    const after = applyBoxGeometry(
      before,
      { kind: "text", key: "student_name" },
      { kind: "rect", rect: { x: 0.2, y: 0.3, w: 0.5, h: 0.2 } },
    );
    expect(after.fields.student_name).toEqual({
      x: 0.2,
      y: 0.3,
      w: 0.5,
      h: 0.2,
      size: 0.06,
      color: "#FFFFFF",
      align: "center",
      font: "great-vibes",
      weight: 400,
    });
  });

  it("leaves the other boxes and the original draft untouched", () => {
    const before = draft();
    const after = applyBoxGeometry(
      before,
      { kind: "text", key: "date" },
      { kind: "rect", rect: { x: 0.2, y: 0.3, w: 0.5, h: 0.2 } },
    );
    expect(after).not.toBe(before);
    expect(before.fields.date.x).toBe(0.1);
    expect(after.fields.student_name).toEqual(before.fields.student_name);
    expect(after.qr).toEqual(before.qr);
    expect(after.signatures).toEqual(before.signatures);
  });

  it("moves the QR", () => {
    const after = applyBoxGeometry(
      draft(),
      { kind: "qr" },
      { kind: "square", square: { x: 0.1, y: 0.2, size: 0.3 } },
    );
    expect(after.qr).toEqual({ x: 0.1, y: 0.2, size: 0.3 });
  });

  it("moves one signature box and keeps its alignment and its siblings", () => {
    const before = draft();
    const after = applyBoxGeometry(
      before,
      { kind: "signature", index: 1 },
      { kind: "rect", rect: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } },
    );
    expect(after.signatures[1]).toEqual({
      x: 0.5,
      y: 0.5,
      w: 0.1,
      h: 0.1,
      align: "left",
    });
    expect(after.signatures[0]).toEqual(before.signatures[0]);
  });

  it("ignores a change whose geometry kind doesn't match the box", () => {
    const before = draft();
    const squareOntoText = applyBoxGeometry(
      before,
      { kind: "text", key: "date" },
      { kind: "square", square: { x: 0, y: 0, size: 0.5 } },
    );
    expect(squareOntoText).toBe(before);

    const rectOntoQr = applyBoxGeometry(
      before,
      { kind: "qr" },
      { kind: "rect", rect: { x: 0, y: 0, w: 0.5, h: 0.5 } },
    );
    expect(rectOntoQr).toBe(before);
  });

  it("ignores a change aimed at a signature box that was removed", () => {
    const before = draft();
    const after = applyBoxGeometry(
      before,
      { kind: "signature", index: 5 },
      { kind: "rect", rect: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } },
    );
    expect(after).toBe(before);
  });

  it("round-trips: reading a box's geometry and writing it back is a no-op in value", () => {
    const before = draft();
    const selections: SelectedBox[] = [
      { kind: "text", key: "student_name" },
      { kind: "text", key: "date" },
      { kind: "text", key: "cert_id" },
      { kind: "qr" },
      { kind: "signature", index: 0 },
      { kind: "signature", index: 1 },
    ];
    for (const selection of selections) {
      const geometry = boxGeometry(before, selection);
      expect(geometry).not.toBeNull();
      if (!geometry) continue;
      expect(applyBoxGeometry(before, selection, geometry)).toEqual(before);
    }
  });
});
