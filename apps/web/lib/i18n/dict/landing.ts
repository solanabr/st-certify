import type { Locale } from "../locales";

/**
 * Landing page (app/page.tsx + landing-cta).
 *
 * Copy here is bound by the forbidden-claims list in the overhaul spec §14:
 * no "assinatura qualificada", no ICP-Brasil, no MEC/diploma, no cartório or
 * fé pública, nothing "imutável"/"impossível de falsificar", and never
 * "a blockchain garante a autenticidade". The legal note below is the
 * approved framing, verbatim.
 */
const pt = {
  "landing.heroTitlePre": "Certificados on-chain da",
  "landing.heroSubtitle":
    "Assinados por quem responde pelo curso, verificáveis por qualquer pessoa, com trilha de auditoria completa.",
  "landing.verifyCta": "Verificar um documento",

  "landing.chooseTitle": "Por onde você quer começar?",
  "landing.card.issue.title": "Emitir certificados",
  "landing.card.issue.desc":
    "Veja as turmas abertas e solicite o seu. Organizações emitem por aqui, com a assinatura de cada responsável.",
  "landing.card.issue.cta": "Ver turmas abertas",
  "landing.card.verify.title": "Verificar documento",
  "landing.card.verify.desc":
    "Confira um certificado pelo código de validação, pelo endereço on-chain ou enviando o arquivo.",
  "landing.card.verify.cta": "Abrir verificação",
  "landing.card.events.title": "Eventos & presença",
  "landing.card.events.desc":
    "Registre a presença do seu evento e entregue um colecionável para cada participante.",
  "landing.card.events.cta": "Área do organizador",

  "landing.howItWorks": "Como funciona",
  "landing.step1.title": "Solicite",
  "landing.step1.desc":
    "Encontre a turma do seu curso e envie seu nome para certificação.",
  "landing.step2.title": "Assinaturas on-chain",
  "landing.step2.desc":
    "Cada signatário designado assina sua solicitação diretamente na Solana.",
  "landing.step3.title": "Resgate o seu",
  "landing.step3.desc":
    "Com todas as assinaturas, o certificado é emitido no seu nome — intransferível, e conferível por qualquer pessoa a qualquer momento.",
  "landing.network": "Rede: Devnet",
  "landing.program": "Programa",
  "landing.programPending": "Programa: aguardando deploy",
  "landing.publicRecord":
    "Cada solicitação, assinatura e emissão fica registrada publicamente na Solana. Dados pessoais não vão para a blockchain — apenas o hash do documento (LGPD).",
  "landing.legalNote":
    "Assinatura eletrônica com validade jurídica conforme a MP 2.200-2/2001 e a Lei 14.063/2020, para uso entre as partes.",
  "cta.goStudio": "Ir para o Studio",
  "cta.goSign": "Ir para as assinaturas",
  "cta.goMyCerts": "Ver meus documentos",
} as const;

export type LandingKey = keyof typeof pt;

export const landingDict: Record<Locale, Record<LandingKey, string>> = {
  "pt-BR": pt,
  en: {
    "landing.heroTitlePre": "On-chain certificates by",
    "landing.heroSubtitle":
      "Signed by the people accountable for the course, verifiable by anyone, with a complete audit trail.",
    "landing.verifyCta": "Verify a document",

    "landing.chooseTitle": "Where would you like to start?",
    "landing.card.issue.title": "Issue certificates",
    "landing.card.issue.desc":
      "Browse the open classes and request yours. Organizations issue here, with a signature from each person responsible.",
    "landing.card.issue.cta": "See open classes",
    "landing.card.verify.title": "Verify a document",
    "landing.card.verify.desc":
      "Check a certificate by its validation code, its on-chain address, or by uploading the file.",
    "landing.card.verify.cta": "Open verification",
    "landing.card.events.title": "Events & attendance",
    "landing.card.events.desc":
      "Record attendance at your event and hand every participant a collectible.",
    "landing.card.events.cta": "Organizer area",

    "landing.howItWorks": "How it works",
    "landing.step1.title": "Request",
    "landing.step1.desc":
      "Find your course's class and submit your name for certification.",
    "landing.step2.title": "On-chain signatures",
    "landing.step2.desc":
      "Each designated signer signs your request directly on Solana.",
    "landing.step3.title": "Claim yours",
    "landing.step3.desc":
      "Once every signature is in, the certificate is issued in your name — non-transferable, and checkable by anyone at any time.",
    "landing.network": "Network: Devnet",
    "landing.program": "Program",
    "landing.programPending": "Program: awaiting deploy",
    "landing.publicRecord":
      "Every request, signature and issuance is publicly recorded on Solana. Personal data never goes on-chain — only the document hash (LGPD).",
    "landing.legalNote":
      "Electronic signature with legal effect under Brazil's MP 2.200-2/2001 and Law 14.063/2020, for use between the parties.",
    "cta.goStudio": "Go to Studio",
    "cta.goSign": "Go to signatures",
    "cta.goMyCerts": "View my documents",
  },
  es: {
    "landing.heroTitlePre": "Certificados on-chain de",
    "landing.heroSubtitle":
      "Firmados por quienes responden por el curso, verificables por cualquier persona, con traza de auditoría completa.",
    "landing.verifyCta": "Verificar un documento",

    "landing.chooseTitle": "¿Por dónde quieres empezar?",
    "landing.card.issue.title": "Emitir certificados",
    "landing.card.issue.desc":
      "Mira las clases abiertas y solicita el tuyo. Las organizaciones emiten aquí, con la firma de cada responsable.",
    "landing.card.issue.cta": "Ver clases abiertas",
    "landing.card.verify.title": "Verificar documento",
    "landing.card.verify.desc":
      "Comprueba un certificado por su código de validación, por su dirección on-chain o subiendo el archivo.",
    "landing.card.verify.cta": "Abrir la verificación",
    "landing.card.events.title": "Eventos y asistencia",
    "landing.card.events.desc":
      "Registra la asistencia de tu evento y entrega un coleccionable a cada participante.",
    "landing.card.events.cta": "Área del organizador",

    "landing.howItWorks": "Cómo funciona",
    "landing.step1.title": "Solicita",
    "landing.step1.desc":
      "Encuentra la clase de tu curso y envía tu nombre para la certificación.",
    "landing.step2.title": "Firmas on-chain",
    "landing.step2.desc":
      "Cada firmante designado firma tu solicitud directamente en Solana.",
    "landing.step3.title": "Reclama el tuyo",
    "landing.step3.desc":
      "Con todas las firmas, el certificado se emite a tu nombre — intransferible, y comprobable por cualquier persona en cualquier momento.",
    "landing.network": "Red: Devnet",
    "landing.program": "Programa",
    "landing.programPending": "Programa: esperando el deploy",
    "landing.publicRecord":
      "Cada solicitud, firma y emisión queda registrada públicamente en Solana. Los datos personales no van a la blockchain — solo el hash del documento (LGPD).",
    "landing.legalNote":
      "Firma electrónica con validez jurídica conforme a la MP 2.200-2/2001 y la Ley 14.063/2020, para uso entre las partes.",
    "cta.goStudio": "Ir al Studio",
    "cta.goSign": "Ir a las firmas",
    "cta.goMyCerts": "Ver mis documentos",
  },
};
