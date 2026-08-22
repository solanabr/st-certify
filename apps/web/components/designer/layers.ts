// The designer's view of "what boxes exist, stacked in what order, and which
// are selected". Pure and DOM-free so the canvas, the palette, the layer list
// and react-selecto can all agree on one identity scheme: the `selectionId`
// string already used for React keys and DOM ids.
//
// Stacking order is deliberately NOT part of the persisted layout: the
// renderer (`lib/render/layout.ts`) draws in a fixed order and the schema has
// no z field, so treating it as data would mean a migration for something
// that only exists to let you reach a box hidden under another one while
// designing. It lives here as view state, reconciled against the draft
// whenever the signature count changes.

import {
  selectionId,
  type DesignerLayoutDraft,
  type SelectedBox,
} from "./types";

/** Render/stack order of the fixed text fields, bottom-most first. */
export const TEXT_FIELD_KEYS = ["student_name", "date", "cert_id"] as const;

export interface DesignerLayer {
  id: string;
  selection: SelectedBox;
}

function isTextFieldKey(
  value: string,
): value is (typeof TEXT_FIELD_KEYS)[number] {
  return (TEXT_FIELD_KEYS as readonly string[]).includes(value);
}

/** Inverse of `selectionId` — returns null for anything that isn't a well-formed id. */
export function parseSelectionId(id: string): SelectedBox | null {
  if (id === "qr") return { kind: "qr" };

  const separator = id.indexOf(":");
  if (separator < 0) return null;
  const prefix = id.slice(0, separator);
  const rest = id.slice(separator + 1);

  if (prefix === "text") {
    return isTextFieldKey(rest) ? { kind: "text", key: rest } : null;
  }
  if (prefix === "signature") {
    const index = Number(rest);
    if (!Number.isInteger(index) || index < 0) return null;
    return { kind: "signature", index };
  }
  return null;
}

/** Every box in the draft, in the schema's own natural order (bottom to top). */
export function draftLayers(draft: DesignerLayoutDraft): DesignerLayer[] {
  const selections: SelectedBox[] = [
    ...TEXT_FIELD_KEYS.map((key): SelectedBox => ({ kind: "text", key })),
    { kind: "qr" },
    ...draft.signatures.map((_, index): SelectedBox => ({
      kind: "signature",
      index,
    })),
  ];
  return selections.map((selection) => ({
    id: selectionId(selection),
    selection,
  }));
}

/**
 * Brings a stored order back in line with the draft: drops ids whose box is
 * gone and appends ones that appeared (on top, where a newly added signature
 * box belongs), preserving the admin's manual ordering for everything else.
 * Called whenever the wizard's signer count changes under the designer.
 */
export function reconcileOrder(
  order: readonly string[],
  draft: DesignerLayoutDraft,
): string[] {
  const layerIds = draftLayers(draft).map((layer) => layer.id);
  const known = new Set(layerIds);
  const seen = new Set<string>();
  const kept = order.filter((id) => {
    if (!known.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return [...kept, ...layerIds.filter((id) => !seen.has(id))];
}

/** Reorders one layer, clamping the destination — the sortable list's commit. */
export function moveLayer(
  order: readonly string[],
  id: string,
  toIndex: number,
): string[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const without = order.filter((entry) => entry !== id);
  const clamped = Math.min(without.length, Math.max(0, toIndex));
  return [...without.slice(0, clamped), id, ...without.slice(clamped)];
}

/** Stack position, bottom = 0. Unknown ids sort below everything known. */
export function zIndexOf(order: readonly string[], id: string): number {
  return order.indexOf(id);
}

/** Draft layers sorted by an explicit stacking order (bottom first). */
export function orderedLayers(
  draft: DesignerLayoutDraft,
  order: readonly string[],
): DesignerLayer[] {
  const layers = draftLayers(draft);
  const position = new Map(order.map((id, index) => [id, index]));
  return [...layers].sort(
    (a, b) =>
      (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (position.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Ctrl/Cmd-click and marquee-add semantics: present -> removed, absent -> appended. */
export function toggleSelected(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}
