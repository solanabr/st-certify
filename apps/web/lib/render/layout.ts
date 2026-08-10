import { z } from "zod";
import { createHash } from "node:crypto";

// Canonical certificate layout: normalized (0-1) coordinates as fractions of
// `canvas.width`/`canvas.height`, so the same layout works for any canvas
// size. `x`/`y`/`w`/`h` are fractions of width/height respectively; `size`
// (font size, QR side length) is always a fraction of `canvas.height`.

const SIGNER_MIN = 2;
const SIGNER_MAX = 6;

const unit = z.number().min(0).max(1);
const alignSchema = z.enum(["left", "center", "right"]);
const fontSchema = z.enum(["inter", "great-vibes"]);
const weightSchema = z.union([z.literal(400), z.literal(600)]);
const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Cor inválida.");
const hexSha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "sha256 inválido.");
const walletAddressSchema = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Endereço de carteira inválido.");

const canvasSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const textFieldSchema = z.object({
  x: unit,
  y: unit,
  w: unit,
  h: unit,
  /** Fraction of canvas.height. */
  size: unit,
  color: hexColorSchema,
  align: alignSchema,
  font: fontSchema,
  weight: weightSchema,
});

const qrFieldSchema = z.object({
  x: unit,
  y: unit,
  /** Square side length, fraction of canvas.height. */
  size: unit,
});

const fieldsSchema = z.object({
  student_name: textFieldSchema,
  date: textFieldSchema,
  cert_id: textFieldSchema,
  qr: qrFieldSchema,
});

const signatureBoxSchema = z.object({
  x: unit,
  y: unit,
  w: unit,
  h: unit,
  align: alignSchema,
});

// Signer bindings mirror the on-chain SignerSlot budget (name[32]/role[24]
// bytes) as a character-count ceiling; exact UTF-8 byte-packing validation
// happens where the edition-creation instruction is built.
const signerBindingSchema = z.object({
  wallet: walletAddressSchema,
  name: z.string().min(1).max(32),
  role: z.string().min(1).max(24),
});

// A draft/template-scaffold layout (e.g. the committed default) legitimately
// has zero signers — they're bound when an edition is created. `.max(6)`
// mirrors the on-chain `signers: [SignerSlot;6]` capacity; the 2..6 floor is
// enforced separately by `editionReadyLayoutSchema` at edition-creation time.
const signersFieldSchema = z.array(signerBindingSchema).max(SIGNER_MAX);

export const layoutSchema = z.object({
  version: z.literal(1),
  canvas: canvasSchema,
  template: z.object({ sha256: hexSha256Schema }),
  signers: signersFieldSchema,
  fields: fieldsSchema,
  signatures: z.array(signatureBoxSchema),
});

/** Stricter variant for a layout that's about to be locked into an edition (create_edition). */
export const editionReadyLayoutSchema = layoutSchema.extend({
  signers: signersFieldSchema.min(SIGNER_MIN),
});

export type Layout = z.infer<typeof layoutSchema>;
export type TextField = z.infer<typeof textFieldSchema>;
export type QrField = z.infer<typeof qrFieldSchema>;
export type SignatureBox = z.infer<typeof signatureBoxSchema>;
export type SignerBinding = z.infer<typeof signerBindingSchema>;
export type Align = z.infer<typeof alignSchema>;
export type FieldFont = z.infer<typeof fontSchema>;

export { SIGNER_MIN, SIGNER_MAX };

function roundTo4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function canonicalizeValue(value: unknown): unknown {
  if (typeof value === "number") {
    return roundTo4(value);
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalizeValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Recursively key-sorted, minified, 4-decimal-rounded canonical JSON string. */
export function canonicalizeLayout(layout: Layout): string {
  return JSON.stringify(canonicalizeValue(layout));
}

/** sha256(canonicalizeLayout(layout)) as raw bytes — the on-chain spec_hash[32]. */
export function specHashBytes(layout: Layout): Uint8Array {
  const digest = createHash("sha256")
    .update(canonicalizeLayout(layout), "utf8")
    .digest();
  return new Uint8Array(digest);
}

/** sha256(canonicalizeLayout(layout)) as lowercase hex — for DB/API/display use. */
export function specHash(layout: Layout): string {
  return createHash("sha256")
    .update(canonicalizeLayout(layout), "utf8")
    .digest("hex");
}
