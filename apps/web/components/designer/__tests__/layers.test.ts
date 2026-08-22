import { describe, it, expect } from "vitest";
import type { DesignerLayoutDraft } from "../types";
import { selectionId } from "../types";
import {
  TEXT_FIELD_KEYS,
  draftLayers,
  moveLayer,
  orderedLayers,
  parseSelectionId,
  reconcileOrder,
  toggleSelected,
  zIndexOf,
} from "../layers";

function draft(signatureCount: number): DesignerLayoutDraft {
  const text = {
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.1,
    size: 0.05,
    color: "#FFFFFF",
    align: "center" as const,
    font: "inter" as const,
    weight: 400 as const,
  };
  return {
    fields: { student_name: text, date: text, cert_id: text },
    qr: { x: 0.8, y: 0.1, size: 0.1 },
    signatures: Array.from({ length: signatureCount }, (_, i) => ({
      x: 0.1 * i,
      y: 0.8,
      w: 0.2,
      h: 0.1,
      align: "center" as const,
    })),
  };
}

describe("parseSelectionId", () => {
  it("round-trips every id selectionId can produce", () => {
    for (const layer of draftLayers(draft(3))) {
      expect(parseSelectionId(layer.id)).toEqual(layer.selection);
      expect(selectionId(layer.selection)).toBe(layer.id);
    }
  });

  it("parses each shape explicitly", () => {
    expect(parseSelectionId("qr")).toEqual({ kind: "qr" });
    expect(parseSelectionId("text:student_name")).toEqual({
      kind: "text",
      key: "student_name",
    });
    expect(parseSelectionId("signature:2")).toEqual({
      kind: "signature",
      index: 2,
    });
  });

  it("rejects ids that don't name a real box", () => {
    expect(parseSelectionId("")).toBeNull();
    expect(parseSelectionId("text")).toBeNull();
    expect(parseSelectionId("text:nope")).toBeNull();
    expect(parseSelectionId("signature:-1")).toBeNull();
    expect(parseSelectionId("signature:1.5")).toBeNull();
    expect(parseSelectionId("signature:abc")).toBeNull();
    expect(parseSelectionId("qr:0")).toBeNull();
  });
});

describe("draftLayers", () => {
  it("lists the three text fields, the QR and every signature", () => {
    expect(draftLayers(draft(2)).map((l) => l.id)).toEqual([
      "text:student_name",
      "text:date",
      "text:cert_id",
      "qr",
      "signature:0",
      "signature:1",
    ]);
  });

  it("covers exactly the schema's fixed text fields", () => {
    expect(TEXT_FIELD_KEYS).toEqual(["student_name", "date", "cert_id"]);
  });

  it("has no signature layers when the edition has no signers", () => {
    expect(draftLayers(draft(0))).toHaveLength(4);
  });
});

describe("reconcileOrder", () => {
  it("keeps a hand-sorted order untouched when nothing changed", () => {
    const custom = [
      "qr",
      "text:cert_id",
      "signature:0",
      "text:date",
      "text:student_name",
    ];
    expect(reconcileOrder(custom, draft(1))).toEqual(custom);
  });

  it("appends a newly added signature on top instead of reshuffling", () => {
    const custom = [
      "qr",
      "text:student_name",
      "text:date",
      "text:cert_id",
      "signature:0",
    ];
    expect(reconcileOrder(custom, draft(2))).toEqual([
      ...custom,
      "signature:1",
    ]);
  });

  it("drops signatures that the signer list removed", () => {
    const custom = [
      "text:student_name",
      "text:date",
      "text:cert_id",
      "qr",
      "signature:0",
      "signature:1",
      "signature:2",
    ];
    expect(reconcileOrder(custom, draft(1))).toEqual([
      "text:student_name",
      "text:date",
      "text:cert_id",
      "qr",
      "signature:0",
    ]);
  });

  it("seeds a full order from an empty one", () => {
    expect(reconcileOrder([], draft(1))).toEqual([
      "text:student_name",
      "text:date",
      "text:cert_id",
      "qr",
      "signature:0",
    ]);
  });

  it("drops unknown ids and de-duplicates a corrupted order", () => {
    const messy = ["qr", "qr", "ghost:9", "text:date"];
    expect(reconcileOrder(messy, draft(0))).toEqual([
      "qr",
      "text:date",
      "text:student_name",
      "text:cert_id",
    ]);
  });
});

describe("moveLayer", () => {
  const order = ["a", "b", "c", "d"];

  it("moves a layer up the stack", () => {
    expect(moveLayer(order, "a", 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a layer down the stack", () => {
    expect(moveLayer(order, "d", 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("clamps an out-of-range destination to the ends", () => {
    expect(moveLayer(order, "a", 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveLayer(order, "d", -5)).toEqual(["d", "a", "b", "c"]);
  });

  it("is a copy, not a mutation, and ignores unknown ids", () => {
    const result = moveLayer(order, "zzz", 0);
    expect(result).toEqual(order);
    expect(result).not.toBe(order);
    expect(order).toEqual(["a", "b", "c", "d"]);
  });
});

describe("zIndexOf / orderedLayers", () => {
  it("reports stack position with 0 at the bottom", () => {
    const order = ["qr", "text:date"];
    expect(zIndexOf(order, "qr")).toBe(0);
    expect(zIndexOf(order, "text:date")).toBe(1);
    expect(zIndexOf(order, "missing")).toBe(-1);
  });

  it("sorts the draft's boxes by the given order", () => {
    const order = [
      "qr",
      "signature:0",
      "text:cert_id",
      "text:date",
      "text:student_name",
    ];
    expect(orderedLayers(draft(1), order).map((l) => l.id)).toEqual(order);
  });

  it("puts boxes missing from the order last rather than dropping them", () => {
    const ids = orderedLayers(draft(1), ["qr"]).map((l) => l.id);
    expect(ids[0]).toBe("qr");
    expect(ids).toHaveLength(5);
  });
});

describe("toggleSelected", () => {
  it("adds an unselected id and removes a selected one", () => {
    expect(toggleSelected(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSelected(["a", "b"], "a")).toEqual(["b"]);
  });

  it("never mutates the array it was given", () => {
    const ids = ["a"];
    toggleSelected(ids, "b");
    expect(ids).toEqual(["a"]);
  });
});
