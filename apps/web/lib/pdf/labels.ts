import type { Locale } from "@/lib/i18n/locales";

/**
 * The printed document's own vocabulary. It lives here rather than in
 * `lib/i18n/dict/**` because a PDF is an artifact, not a screen: these strings
 * are frozen into files that outlive the UI, so they must not drift when the
 * app's copy is reworded. Nothing outside `lib/pdf` reads them.
 *
 * Copy obeys the forbidden-claims list (spec §14): no "assinatura qualificada",
 * no ICP-Brasil, no "validade jurídica plena", no claim that the blockchain
 * guarantees authenticity.
 */
const pt = {
  docTitle: "Certificado",
  verifyPrompt: "Verifique a autenticidade deste documento em:",
  code: "Código de validação",
  fileHash: "SHA-256 da imagem do certificado",
  auditTitle: "Trilha de auditoria",
  auditIntro:
    "Registro das informações que permitem conferir este documento de forma independente. Os dados pessoais não são publicados em blockchain — apenas o hash do arquivo.",
  issuer: "Emissor",
  issuerContact: "Contato do emissor",
  issuerCnpj: "CNPJ",
  holder: "Titular",
  edition: "Certificado",
  issuedAt: "Emitido em",
  network: "Rede",
  transaction: "Transação",
  explorer: "Explorador",
  asset: "Registro on-chain",
  verifyUrl: "Página de verificação",
  signers: "Assinaturas eletrônicas",
  signerName: "Signatário",
  signerRole: "Cargo",
  signerWallet: "Chave pública",
  signerSignedAt: "Assinado em",
  signerTx: "Transação",
  pending: "Aguardando assinatura",
  none: "—",
  legalNote:
    "Assinatura eletrônica com validade jurídica entre as partes, conforme a MP 2.200-2/2001 e a Lei 14.063/2020. Carimbo de tempo público e independente registrado na rede Solana.",
} as const;

export type PdfLabelKey = keyof typeof pt;

export const PDF_LABELS: Record<Locale, Record<PdfLabelKey, string>> = {
  "pt-BR": pt,
  en: {
    docTitle: "Certificate",
    verifyPrompt: "Check the authenticity of this document at:",
    code: "Validation code",
    fileHash: "Certificate image SHA-256",
    auditTitle: "Audit trail",
    auditIntro:
      "A record of everything needed to check this document independently. Personal data is not published on the blockchain — only the file hash.",
    issuer: "Issuer",
    issuerContact: "Issuer contact",
    issuerCnpj: "Company ID (CNPJ)",
    holder: "Holder",
    edition: "Certificate",
    issuedAt: "Issued on",
    network: "Network",
    transaction: "Transaction",
    explorer: "Explorer",
    asset: "On-chain record",
    verifyUrl: "Verification page",
    signers: "Electronic signatures",
    signerName: "Signer",
    signerRole: "Role",
    signerWallet: "Public key",
    signerSignedAt: "Signed on",
    signerTx: "Transaction",
    pending: "Awaiting signature",
    none: "—",
    legalNote:
      "Electronic signature legally binding between the parties under Brazilian MP 2.200-2/2001 and Law 14.063/2020. Public, independent timestamp recorded on the Solana network.",
  },
  es: {
    docTitle: "Certificado",
    verifyPrompt: "Verifica la autenticidad de este documento en:",
    code: "Código de validación",
    fileHash: "SHA-256 de la imagen del certificado",
    auditTitle: "Rastro de auditoría",
    auditIntro:
      "Registro de la información necesaria para comprobar este documento de forma independiente. Los datos personales no se publican en blockchain — solo el hash del archivo.",
    issuer: "Emisor",
    issuerContact: "Contacto del emisor",
    issuerCnpj: "CNPJ",
    holder: "Titular",
    edition: "Certificado",
    issuedAt: "Emitido el",
    network: "Red",
    transaction: "Transacción",
    explorer: "Explorador",
    asset: "Registro on-chain",
    verifyUrl: "Página de verificación",
    signers: "Firmas electrónicas",
    signerName: "Firmante",
    signerRole: "Cargo",
    signerWallet: "Clave pública",
    signerSignedAt: "Firmado el",
    signerTx: "Transacción",
    pending: "Esperando firma",
    none: "—",
    legalNote:
      "Firma electrónica con validez jurídica entre las partes, conforme a la MP 2.200-2/2001 y la Ley 14.063/2020 de Brasil. Sello de tiempo público e independiente registrado en la red Solana.",
  },
};
