import type { QrField, SignatureBox, TextField } from "@/lib/render/layout";

/** The three text fields the schema fixes by name (`lib/render/layout.ts`'s `fieldsSchema`, minus `qr`). */
export type TextFieldKey = "student_name" | "date" | "cert_id";

/** Discriminated selection so the field-editor panel knows which controls to show (text fields get font/size/color; qr gets none of those; signatures get align only). */
export type SelectedBox =
  | { kind: "text"; key: TextFieldKey }
  | { kind: "qr" }
  | { kind: "signature"; index: number };

/** Stable string id for React keys / DOM ids / equality checks — derived, never stored independently. */
export function selectionId(selection: SelectedBox): string {
  if (selection.kind === "text") return `text:${selection.key}`;
  if (selection.kind === "qr") return "qr";
  return `signature:${selection.index}`;
}

export function selectionsEqual(
  a: SelectedBox | null,
  b: SelectedBox | null,
): boolean {
  if (a === null || b === null) return a === b;
  return selectionId(a) === selectionId(b);
}

/** The part of a Layout the designer edits — canvas/template/signers are owned by the upload step and the wizard's step-2 signer list, not drawn on the canvas. */
export interface DesignerLayoutDraft {
  fields: {
    student_name: TextField;
    date: TextField;
    cert_id: TextField;
  };
  qr: QrField;
  signatures: SignatureBox[];
}

export const TEXT_FIELD_LABELS: Record<TextFieldKey, string> = {
  student_name: "Nome do aluno",
  date: "Data",
  cert_id: "ID do certificado",
};
