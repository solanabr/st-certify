import { z } from "zod";
import { layoutSchema } from "@/lib/render/layout";

const BIDI_CONTROL_CHARS = new RegExp("[\\u202A-\\u202E\\u2066-\\u2069]", "g");
const ZERO_WIDTH_CHARS = new RegExp("[\\u200B-\\u200F\\uFEFF]", "g");
const NAME_CHARSET = /^[\p{L}\p{M}\p{N} '\-.]+$/u;
const BASE58_CHARSET = /^[1-9A-HJ-NP-Za-km-z]+$/;

// Homoglyph mitigation (plan §Security #2 "mixed-script flag"): Cyrillic and
// Greek are the classic Latin-lookalike sources (e.g. Cyrillic "а" U+0430 vs
// Latin "a" U+0061) — swapping 1-2 letters from one of these into an
// otherwise-Latin name is the standard impersonation trick ("Vitalik" with a
// Cyrillic а). This is a scoped heuristic, not full Unicode UTS #39
// confusables detection: it only flags Latin mixed with Cyrillic/Greek, so
// genuine non-Latin names (Cyrillic-only, CJK, Korean, Armenian, ...) are
// unaffected — only the MIXTURE is suspicious, not any single script.
const LATIN_LETTER = /\p{Script=Latin}/u;
const CONFUSABLE_LETTER = /\p{Script=Cyrillic}|\p{Script=Greek}/u;

function hasSuspiciousScriptMix(value: string): boolean {
  return LATIN_LETTER.test(value) && CONFUSABLE_LETTER.test(value);
}

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
      .regex(NAME_CHARSET, "Nome contém caracteres não permitidos.")
      .refine(
        (v) => !hasSuspiciousScriptMix(v),
        "Nome mistura alfabetos incompatíveis (possível caractere confundível).",
      ),
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

/**
 * UTF-8 byte-aware max length — `encodeUtf8Fixed` truncates silently past
 * this, so validate in bytes, not JS chars. Returns a plain boolean predicate
 * for `.refine(predicate, message)`: zod's `.refine()` treats ANY truthy
 * return as "valid" (verified against 4.4.3 — it does not special-case a
 * returned string as a failure), so the message must be passed as refine's
 * separate second argument, never folded into the predicate via `|| message`
 * (that pattern always "passes" once the value is non-empty, silently
 * disabling the length check).
 */
function maxUtf8Bytes(max: number): (value: string) => boolean {
  return (value: string) => utf8ByteLength(value) <= max;
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
      maxUtf8Bytes(EDITION_NAME_MAX_BYTES),
      `Nome muito longo (máx. ${EDITION_NAME_MAX_BYTES} bytes).`,
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
      maxUtf8Bytes(SIGNER_NAME_MAX_BYTES),
      `Nome muito longo (máx. ${SIGNER_NAME_MAX_BYTES} bytes).`,
    ),
  role: z
    .string()
    .trim()
    .min(1, "Cargo obrigatório.")
    .refine(
      maxUtf8Bytes(SIGNER_ROLE_MAX_BYTES),
      `Cargo muito longo (máx. ${SIGNER_ROLE_MAX_BYTES} bytes).`,
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
 * The full wizard payload (steps 1+2+3+4+5). `templatePath: "custom"`
 * requires `customLayout` — the M6 designer's output, which must already
 * validate against M2's `layoutSchema` (`lib/render/layout.ts`) before it
 * ever reaches here. Deliberately a flat object with an optional field
 * rather than a `z.discriminatedUnion`: RHF's `useForm<EditionWizardInput>`
 * needs one stable shape across the whole wizard (the discriminant flips
 * mid-form, on step 3/4), and a discriminated union would fight that.
 */
export const editionWizardSchema = z
  .object({
    meta: editionMetaSchema,
    signers: editionSignersSchema,
    templatePath: z.enum(["default", "custom"]),
    customLayout: layoutSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.templatePath === "custom" && !val.customLayout) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Layout do template personalizado ausente.",
        path: ["customLayout"],
      });
    }
  });

export type EditionMetaInput = z.infer<typeof editionMetaSchema>;
export type EditionSignerFormInput = z.infer<typeof editionSignerFormSchema>;
export type EditionWizardInput = z.infer<typeof editionWizardSchema>;

// ---------------------------------------------------------------------------
// M5 — revoke (admin, destructive). Reason is required + shown to the student
// on /me and on the public /verify REVOKED banner, so it must be meaningful.
// ---------------------------------------------------------------------------

export const revokeSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Informe um motivo (mín. 3 caracteres).")
    .max(500, "Motivo muito longo (máx. 500 caracteres)."),
});

export type RevokeInput = z.infer<typeof revokeSchema>;
