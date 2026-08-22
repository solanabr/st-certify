// Reading and writing one box's geometry on a draft, by selection. The three
// text fields, the QR and the signature boxes live in three differently
// shaped places in `DesignerLayoutDraft`, and every interaction — drag,
// resize, nudge, click-to-place, the percent inputs — needs the same
// "whatever is selected, move it" indirection. It exists once, here, so the
// canvas and the toolbar don't each grow their own switch statement.
//
// Geometry patches are partial by construction: they only ever carry x/y/w/h
// (or x/y/size), never a field's colour, font or alignment, so applying one
// can't silently drop styling.

import type { FracRect, FracSquare } from "./geometry";
import type { DesignerLayoutDraft, SelectedBox } from "./types";

export type BoxGeometry =
  { kind: "rect"; rect: FracRect } | { kind: "square"; square: FracSquare };

export interface BoxGeometryChange {
  id: string;
  geometry: BoxGeometry;
}

/** The QR is the only square box — everything else is a rect. */
export function isSquareSelection(selection: SelectedBox): boolean {
  return selection.kind === "qr";
}

export function boxGeometry(
  draft: DesignerLayoutDraft,
  selection: SelectedBox,
): BoxGeometry | null {
  if (selection.kind === "text") {
    const { x, y, w, h } = draft.fields[selection.key];
    return { kind: "rect", rect: { x, y, w, h } };
  }
  if (selection.kind === "qr") {
    const { x, y, size } = draft.qr;
    return { kind: "square", square: { x, y, size } };
  }
  const box = draft.signatures[selection.index];
  if (!box) return null;
  return { kind: "rect", rect: { x: box.x, y: box.y, w: box.w, h: box.h } };
}

/** Returns the draft unchanged when the selection and geometry kinds disagree, or the box is gone. */
export function applyBoxGeometry(
  draft: DesignerLayoutDraft,
  selection: SelectedBox,
  geometry: BoxGeometry,
): DesignerLayoutDraft {
  if (selection.kind === "text") {
    if (geometry.kind !== "rect") return draft;
    return {
      ...draft,
      fields: {
        ...draft.fields,
        [selection.key]: { ...draft.fields[selection.key], ...geometry.rect },
      },
    };
  }
  if (selection.kind === "qr") {
    if (geometry.kind !== "square") return draft;
    return { ...draft, qr: { ...draft.qr, ...geometry.square } };
  }
  if (geometry.kind !== "rect") return draft;
  if (!draft.signatures[selection.index]) return draft;
  return {
    ...draft,
    signatures: draft.signatures.map((box, index) =>
      index === selection.index ? { ...box, ...geometry.rect } : box,
    ),
  };
}
