import type { Locale } from "../locales";

/**
 * Public verify surface (`/verify/[id]` + its result components) and the app's
 * system pages (error boundary, 404). The verify tool's own strings predate the
 * dict/ split and live in dict/common.ts under the same "verify." prefix.
 */
const pt = {
  "verify.meta.titleFallback": "Verificar certificado · Superteam Certify",
  "verify.meta.descriptionFallback":
    "Verificação de certificado onchain da Superteam Brasil.",
  "verify.meta.descriptionRevoked": "Certificado de {student} — REVOGADO.",
  "verify.meta.description":
    'Certificado de {student} para "{edition}", verificável onchain.',
  "verify.verifyAnother": "Verificar outro",
  "verify.fallback.title": "Detalhes indisponíveis",
  "verify.fallback.body":
    "Não foi possível carregar os detalhes deste certificado. A verificação on-chain abaixo é a fonte da verdade.",
  "verify.banner.revokedTitle": "Certificado revogado",
  "verify.banner.revokedBody":
    "Este certificado foi revogado e não é mais válido.",
  "verify.banner.validTitle": "Certificado válido",
  "verify.banner.validBody":
    "Este certificado foi emitido pela Superteam Brasil e registrado on-chain.",
  "verify.banner.reencodeTitle": "Arquivo é uma recodificação",
  "verify.banner.reencodeBody":
    "Válido — mas este arquivo é uma recodificação (ex.: captura de tela). O original verificável está abaixo.",
  "verify.banner.pendingTitle": "Certificado em andamento",
  "verify.banner.pendingBody":
    "As assinaturas ainda estão sendo coletadas — este certificado ainda não foi resgatado.",
  "verify.banner.invalidTitle": "Certificado não válido",
  "verify.banner.invalidBody":
    "Esta solicitação foi encerrada e não corresponde a um certificado emitido.",
  "verify.media.imageAlt": "Certificado de {student}",
  "verify.media.revokedStamp": "Revogado",
  "verify.detail.student": "Aluno",
  "verify.detail.number": "Nº",
  "verify.detail.numberOf": "#{number} de {max}",
  "verify.detail.date": "Data",
  "verify.detail.edition": "Edição",
  "verify.detail.signatures": "Assinaturas",
  "verify.signers.name": "Signatário",
  "verify.signers.role": "Cargo",
  "verify.signers.signedAt": "Assinado em",
  "verify.signers.tx": "Transação",
  "verify.signers.signed": "assinado",
  "verify.signers.awaiting": "aguardando assinatura",
  "verify.stamp.checking": "Verificando on-chain…",
  "verify.stamp.unconfirmed":
    "Não foi possível confirmar este certificado on-chain no momento.",
  "verify.stamp.revoked":
    "Revogado on-chain — este certificado não é mais válido.",
  "verify.stamp.verified": "verificado onchain",
  "verify.stamp.slot": "· slot {slot}",
  "verify.stamp.viewNft": "Ver registro on-chain (intransferível)",
  "verify.stamp.drift":
    "A rede tem uma atualização mais recente — exibindo o estado on-chain.",
  "system.error.title": "Algo deu errado",
  "system.error.body":
    "Ocorreu um erro inesperado ao carregar esta página. Tente novamente.",
  "system.error.retry": "Tentar novamente",
  "system.notFound.title": "Página não encontrada",
  "system.notFound.body":
    "O endereço acessado não existe ou você não tem permissão para visualizá-lo.",
  "system.notFound.home": "Voltar ao início",
} as const;

export type verifyKey = keyof typeof pt;

export const verifyDict: Record<Locale, Record<verifyKey, string>> = {
  "pt-BR": pt,
  en: {
    "verify.meta.titleFallback": "Verify certificate · Superteam Certify",
    "verify.meta.descriptionFallback":
      "On-chain certificate verification by Superteam Brazil.",
    "verify.meta.descriptionRevoked": "{student}'s certificate — REVOKED.",
    "verify.meta.description":
      '{student}\'s certificate for "{edition}", verifiable on-chain.',
    "verify.verifyAnother": "Verify another",
    "verify.fallback.title": "Details unavailable",
    "verify.fallback.body":
      "We couldn't load the details of this certificate. The on-chain verification below is the source of truth.",
    "verify.banner.revokedTitle": "Certificate revoked",
    "verify.banner.revokedBody":
      "This certificate has been revoked and is no longer valid.",
    "verify.banner.validTitle": "Valid certificate",
    "verify.banner.validBody":
      "This certificate was issued by Superteam Brazil and recorded on-chain.",
    "verify.banner.reencodeTitle": "File is a re-encode",
    "verify.banner.reencodeBody":
      "Valid — but this file is a re-encode (e.g. a screenshot). The verifiable original is below.",
    "verify.banner.pendingTitle": "Certificate in progress",
    "verify.banner.pendingBody":
      "Signatures are still being collected — this certificate hasn't been claimed yet.",
    "verify.banner.invalidTitle": "Certificate not valid",
    "verify.banner.invalidBody":
      "This request was closed and does not correspond to an issued certificate.",
    "verify.media.imageAlt": "{student}'s certificate",
    "verify.media.revokedStamp": "Revoked",
    "verify.detail.student": "Student",
    "verify.detail.number": "No.",
    "verify.detail.numberOf": "#{number} of {max}",
    "verify.detail.date": "Date",
    "verify.detail.edition": "Edition",
    "verify.detail.signatures": "Signatures",
    "verify.signers.name": "Signer",
    "verify.signers.role": "Role",
    "verify.signers.signedAt": "Signed at",
    "verify.signers.tx": "Transaction",
    "verify.signers.signed": "signed",
    "verify.signers.awaiting": "awaiting signature",
    "verify.stamp.checking": "Verifying on-chain…",
    "verify.stamp.unconfirmed":
      "We couldn't confirm this certificate on-chain right now.",
    "verify.stamp.revoked":
      "Revoked on-chain — this certificate is no longer valid.",
    "verify.stamp.verified": "verified onchain",
    "verify.stamp.slot": "· slot {slot}",
    "verify.stamp.viewNft": "View on-chain record (non-transferable)",
    "verify.stamp.drift":
      "The network has a more recent update — showing the on-chain state.",
    "system.error.title": "Something went wrong",
    "system.error.body":
      "An unexpected error occurred while loading this page. Please try again.",
    "system.error.retry": "Try again",
    "system.notFound.title": "Page not found",
    "system.notFound.body":
      "The address you visited doesn't exist, or you don't have permission to view it.",
    "system.notFound.home": "Back to home",
  },
  es: {
    "verify.meta.titleFallback": "Verificar certificado · Superteam Certify",
    "verify.meta.descriptionFallback":
      "Verificación de certificados on-chain de Superteam Brasil.",
    "verify.meta.descriptionRevoked": "Certificado de {student} — REVOCADO.",
    "verify.meta.description":
      'Certificado de {student} para "{edition}", verificable on-chain.',
    "verify.verifyAnother": "Verificar otro",
    "verify.fallback.title": "Detalles no disponibles",
    "verify.fallback.body":
      "No se pudieron cargar los detalles de este certificado. La verificación on-chain de abajo es la fuente de la verdad.",
    "verify.banner.revokedTitle": "Certificado revocado",
    "verify.banner.revokedBody":
      "Este certificado fue revocado y ya no es válido.",
    "verify.banner.validTitle": "Certificado válido",
    "verify.banner.validBody":
      "Este certificado fue emitido por Superteam Brasil y registrado on-chain.",
    "verify.banner.reencodeTitle": "El archivo es una recodificación",
    "verify.banner.reencodeBody":
      "Válido — pero este archivo es una recodificación (ej.: una captura de pantalla). El original verificable está abajo.",
    "verify.banner.pendingTitle": "Certificado en curso",
    "verify.banner.pendingBody":
      "Todavía se están recogiendo las firmas — este certificado aún no ha sido reclamado.",
    "verify.banner.invalidTitle": "Certificado no válido",
    "verify.banner.invalidBody":
      "Esta solicitud fue cerrada y no corresponde a un certificado emitido.",
    "verify.media.imageAlt": "Certificado de {student}",
    "verify.media.revokedStamp": "Revocado",
    "verify.detail.student": "Alumno",
    "verify.detail.number": "N.º",
    "verify.detail.numberOf": "#{number} de {max}",
    "verify.detail.date": "Fecha",
    "verify.detail.edition": "Edición",
    "verify.detail.signatures": "Firmas",
    "verify.signers.name": "Firmante",
    "verify.signers.role": "Cargo",
    "verify.signers.signedAt": "Firmado el",
    "verify.signers.tx": "Transacción",
    "verify.signers.signed": "firmado",
    "verify.signers.awaiting": "esperando firma",
    "verify.stamp.checking": "Verificando on-chain…",
    "verify.stamp.unconfirmed":
      "No se pudo confirmar este certificado on-chain en este momento.",
    "verify.stamp.revoked":
      "Revocado on-chain — este certificado ya no es válido.",
    "verify.stamp.verified": "verificado onchain",
    "verify.stamp.slot": "· slot {slot}",
    "verify.stamp.viewNft": "Ver registro on-chain (intransferible)",
    "verify.stamp.drift":
      "La red tiene una actualización más reciente — mostrando el estado on-chain.",
    "system.error.title": "Algo salió mal",
    "system.error.body":
      "Ocurrió un error inesperado al cargar esta página. Inténtalo de nuevo.",
    "system.error.retry": "Intentar de nuevo",
    "system.notFound.title": "Página no encontrada",
    "system.notFound.body":
      "La dirección a la que accediste no existe o no tienes permiso para verla.",
    "system.notFound.home": "Volver al inicio",
  },
};
