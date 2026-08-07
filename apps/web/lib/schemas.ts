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
