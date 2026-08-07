import { z } from "zod";

const BIDI_CONTROL_CHARS = new RegExp("[\\u202A-\\u202E\\u2066-\\u2069]", "g");
const ZERO_WIDTH_CHARS = new RegExp("[\\u200B-\\u200F\\uFEFF]", "g");
const NAME_CHARSET = /^[\p{L}\p{M}\p{N} '\-.]+$/u;
const BASE58_CHARSET = /^[1-9A-HJ-NP-Za-km-z]+$/;

function cleanStudentName(value: string): string {
  return value
    .normalize("NFC")
    .replace(BIDI_CONTROL_CHARS, "")
    .replace(ZERO_WIDTH_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const studentNameSchema = z
  .string()
  .transform(cleanStudentName)
  .pipe(
    z
      .string()
      .min(2, "Nome deve ter pelo menos 2 caracteres.")
      .max(64, "Nome deve ter no máximo 64 caracteres.")
      .regex(NAME_CHARSET, "Nome contém caracteres não permitidos."),
  );

export const requestCertificateSchema = z.object({
  editionAddress: z
    .string()
    .min(32, "Endereço da edição inválido.")
    .max(44, "Endereço da edição inválido.")
    .regex(BASE58_CHARSET, "Endereço da edição inválido."),
  name: studentNameSchema,
  consent: z.literal(true, "É necessário aceitar os termos para continuar."),
});

export type StudentName = z.infer<typeof studentNameSchema>;
export type RequestCertificateInput = z.infer<typeof requestCertificateSchema>;

// ---------------------------------------------------------------------------
// Admin creation wizard (lib/chain/** owns @certify/client, so the fixed
// on-chain byte limits below are duplicated as plain numbers rather than
// imported — they mirror EDITION_NAME_LEN/SIGNER_NAME_LEN/SIGNER_ROLE_LEN).
// ---------------------------------------------------------------------------

const EDITION_NAME_MAX_BYTES = 64;
const SIGNER_NAME_MAX_BYTES = 32;
const SIGNER_ROLE_MAX_BYTES = 24;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** UTF-8 byte-aware max length — `encodeUtf8Fixed` truncates silently past this, so validate in bytes, not JS chars. */
function maxUtf8Bytes(max: number, message: string) {
  return (value: string) => utf8ByteLength(value) <= max || message;
}

export const walletAddressSchema = z
  .string()
  .min(32, "Endereço de carteira inválido.")
  .max(44, "Endereço de carteira inválido.")
  .regex(BASE58_CHARSET, "Endereço de carteira inválido.");

export const slugSchema = z
  .string()
  .min(3, "Slug deve ter pelo menos 3 caracteres.")
  .max(64, "Slug deve ter no máximo 64 caracteres.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use apenas letras minúsculas, números e hífens.",
  );

export const editionMetaSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Nome deve ter pelo menos 3 caracteres.")
    .refine(
      maxUtf8Bytes(
        EDITION_NAME_MAX_BYTES,
        `Nome muito longo (máx. ${EDITION_NAME_MAX_BYTES} bytes).`,
      ),
    ),
  slug: slugSchema,
  // Blank means "uncapped". Deliberately NOT z.coerce/z.preprocess here —
  // both make zodResolver's inferred input type diverge from EditionWizardInput
  // (preprocess's input type defaults to `unknown`), breaking useForm<T>'s
  // generic. The form's onChange instead normalizes "" -> undefined before it
  // ever reaches RHF state, so this field only ever sees number | undefined.
  maxSupply: z
    .number()
    .int("Deve ser um número inteiro.")
    .positive("Deve ser maior que zero.")
    .max(1_000_000, "Valor muito alto.")
    .optional(),
  completionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .optional()
    .or(z.literal("")),
  description: z.string().trim().max(500, "Descrição muito longa.").optional(),
});

export const editionSignerFormSchema = z.object({
  wallet: walletAddressSchema,
  name: z
    .string()
    .trim()
    .min(1, "Nome obrigatório.")
    .refine(
      maxUtf8Bytes(
        SIGNER_NAME_MAX_BYTES,
        `Nome muito longo (máx. ${SIGNER_NAME_MAX_BYTES} bytes).`,
      ),
    ),
  role: z
    .string()
    .trim()
    .min(1, "Cargo obrigatório.")
    .refine(
      maxUtf8Bytes(
        SIGNER_ROLE_MAX_BYTES,
        `Cargo muito longo (máx. ${SIGNER_ROLE_MAX_BYTES} bytes).`,
      ),
    ),
});

export const editionSignersSchema = z
  .array(editionSignerFormSchema)
  .min(2, "São necessários pelo menos 2 signatários.")
  .max(6, "No máximo 6 signatários.")
  .superRefine((signers, ctx) => {
    const seen = new Set<string>();
    signers.forEach((s, index) => {
      if (seen.has(s.wallet)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Esta carteira já foi adicionada.",
          path: [index, "wallet"],
        });
      }
      seen.add(s.wallet);
    });
  });

/**
 * The full wizard payload (steps 1+2+3+5 — step 4's custom designer is M6).
 * `templatePath: "default"` is the only path M3 ships; a `custom` variant
 * slots in later without changing this shape's discriminant.
 */
export const editionWizardSchema = z.object({
  meta: editionMetaSchema,
  signers: editionSignersSchema,
  templatePath: z.literal("default"),
});

export type EditionMetaInput = z.infer<typeof editionMetaSchema>;
export type EditionSignerFormInput = z.infer<typeof editionSignerFormSchema>;
export type EditionWizardInput = z.infer<typeof editionWizardSchema>;
