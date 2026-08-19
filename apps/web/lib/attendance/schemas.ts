import { z } from "zod";

export const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const walletSchema = z.string().regex(BASE58_RE, "Carteira inválida.");

export const IMAGE_DATA_URL_RE =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const imageDataUrlSchema = z.string().refine((v) => {
  const m = v.match(IMAGE_DATA_URL_RE);
  if (!m) return false;
  // base64 length → decoded byte estimate (no full decode on the hot path)
  return (m[2].length * 3) / 4 <= MAX_IMAGE_BYTES;
}, "Imagem inválida — use PNG, JPEG ou WebP de até 2MB.");

export const createEventSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome.")
    .max(32, "Máximo de 32 caracteres."),
  description: z
    .string()
    .trim()
    .max(500, "Máximo de 500 caracteres.")
    .default(""),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  imageDataUrl: imageDataUrlSchema,
  maxSupply: z.number().int().min(1).max(10_000).optional(),
  claimDeadline: z.string().datetime({ offset: true }).optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const claimSchema = z.object({
  token: z.string().min(10),
  wallet: walletSchema,
  message: z.string().max(2_000).optional(),
  signatureBase64: z.string().max(200).optional(),
});
export type ClaimInput = z.infer<typeof claimSchema>;

export const eventActionSchema = z.object({
  action: z.enum(["pause", "resume", "rotate"]),
});
export type EventActionInput = z.infer<typeof eventActionSchema>;

export const authNonceSchema = z.object({
  wallet: walletSchema,
  purpose: z.enum(["attendance-claim", "attendance-creator"]),
});

export const authVerifySchema = z.object({
  wallet: walletSchema,
  message: z.string().max(2_000),
  signatureBase64: z.string().max(200),
});
