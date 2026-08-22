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

  "landing.verify.demo.tag": "Demonstração",
  "landing.verify.demo.title": "Verificar um certificado",
  "landing.verify.demo.label": "Código de validação ou endereço on-chain",
  "landing.verify.demo.placeholder": "Cole o código ou o endereço",
  "landing.verify.demo.cta": "Verificar",
  "landing.verify.demo.checking": "Verificando…",
  "landing.verify.demo.opening": "Abrindo verificação…",
  "landing.verify.demo.hint":
    "Prévia interativa — a verificação real abre na tela de verificação.",
  "landing.verify.demo.fallback": "Abrir verificação completa",

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

  "landing.chip.verifiable": "Verificável por qualquer pessoa",
  "landing.chip.multisig": "Assinatura multi-signatário",
  "landing.chip.onchain": "Registro on-chain",
  "landing.chip.lgpd": "LGPD: só o hash",

  "landing.seal.docTitle": "Certificado",
  "landing.seal.badge": "Verificado on-chain",
  "landing.seal.signedBy": "Assinado on-chain",

  "landing.eyebrow.start": "Comece por aqui",
  "landing.eyebrow.features": "Por dentro",
  "landing.eyebrow.trust": "Confiança",
  "landing.eyebrow.how": "O processo",

  "landing.chooseSubtitle": "Três portas de entrada — escolha a sua.",
  "landing.card.issue.tag": "Para organizações",
  "landing.card.verify.tag": "Para qualquer pessoa",
  "landing.card.events.tag": "Para organizadores",

  "landing.features.title": "Por que isso é confiável",
  "landing.features.subtitle": "Mecanismos abertos, não promessas.",
  "landing.feature.audit.title": "Trilha de auditoria completa",
  "landing.feature.audit.desc":
    "Cada solicitação, assinatura e emissão fica registrada publicamente na Solana — do pedido ao certificado final.",
  "landing.feature.nontransfer.title": "Intransferível",
  "landing.feature.nontransfer.desc":
    "Emitido no nome de quem concluiu — não pode ser vendido nem repassado.",
  "landing.feature.open.title": "Verificação aberta",
  "landing.feature.open.desc":
    "Qualquer pessoa confere pelo código, pelo endereço on-chain ou pelo arquivo.",
  "landing.feature.multisig.title": "Múltiplas assinaturas",
  "landing.feature.multisig.desc":
    "Cada responsável pelo curso assina on-chain antes da emissão.",
  "landing.feature.privacy.title": "Privacidade por padrão",
  "landing.feature.privacy.desc":
    "Dados pessoais não vão para a blockchain — apenas o hash do documento.",

  "landing.trust.title": "Base legal e técnica",
  "landing.trust.mp.label": "MP 2.200-2/2001",
  "landing.trust.mp.sub": "Assinatura eletrônica",
  "landing.trust.law.label": "Lei 14.063/2020",
  "landing.trust.law.sub": "Uso entre as partes",
  "landing.trust.timestamp.label": "Carimbo de tempo on-chain",
  "landing.trust.timestamp.sub": "Registrado na Solana",
  "landing.trust.public.label": "Registro público",
  "landing.trust.public.sub": "Conferível a qualquer hora",
  "landing.trust.lgpd.label": "LGPD",
  "landing.trust.lgpd.sub": "Só o hash on-chain",

  "landing.howSubtitle": "Do pedido ao certificado, em três passos.",
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

    "landing.verify.demo.tag": "Live demo",
    "landing.verify.demo.title": "Verify a certificate",
    "landing.verify.demo.label": "Validation code or on-chain address",
    "landing.verify.demo.placeholder": "Paste the code or address",
    "landing.verify.demo.cta": "Verify",
    "landing.verify.demo.checking": "Verifying…",
    "landing.verify.demo.opening": "Opening verification…",
    "landing.verify.demo.hint":
      "Interactive preview — the real check opens on the verification screen.",
    "landing.verify.demo.fallback": "Open full verification",

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

    "landing.chip.verifiable": "Verifiable by anyone",
    "landing.chip.multisig": "Multi-signer signature",
    "landing.chip.onchain": "On-chain record",
    "landing.chip.lgpd": "LGPD: hash only",

    "landing.seal.docTitle": "Certificate",
    "landing.seal.badge": "Verified on-chain",
    "landing.seal.signedBy": "Signed on-chain",

    "landing.eyebrow.start": "Start here",
    "landing.eyebrow.features": "Under the hood",
    "landing.eyebrow.trust": "Trust",
    "landing.eyebrow.how": "The process",

    "landing.chooseSubtitle": "Three front doors — pick yours.",
    "landing.card.issue.tag": "For organizations",
    "landing.card.verify.tag": "For anyone",
    "landing.card.events.tag": "For organizers",

    "landing.features.title": "Why this is trustworthy",
    "landing.features.subtitle": "Open mechanisms, not promises.",
    "landing.feature.audit.title": "Complete audit trail",
    "landing.feature.audit.desc":
      "Every request, signature and issuance is recorded publicly on Solana — from request to final certificate.",
    "landing.feature.nontransfer.title": "Non-transferable",
    "landing.feature.nontransfer.desc":
      "Issued in the name of whoever earned it — it can't be sold or handed off.",
    "landing.feature.open.title": "Open verification",
    "landing.feature.open.desc":
      "Anyone can check it by code, on-chain address, or file.",
    "landing.feature.multisig.title": "Multiple signatures",
    "landing.feature.multisig.desc":
      "Each person accountable for the course signs on-chain before issuance.",
    "landing.feature.privacy.title": "Privacy by default",
    "landing.feature.privacy.desc":
      "Personal data never goes on-chain — only the document hash.",

    "landing.trust.title": "Legal & technical footing",
    "landing.trust.mp.label": "MP 2.200-2/2001",
    "landing.trust.mp.sub": "Electronic signature",
    "landing.trust.law.label": "Law 14.063/2020",
    "landing.trust.law.sub": "For use between parties",
    "landing.trust.timestamp.label": "On-chain timestamp",
    "landing.trust.timestamp.sub": "Recorded on Solana",
    "landing.trust.public.label": "Public record",
    "landing.trust.public.sub": "Checkable anytime",
    "landing.trust.lgpd.label": "LGPD",
    "landing.trust.lgpd.sub": "Only the hash on-chain",

    "landing.howSubtitle": "From request to certificate, in three steps.",
    "cta.goStudio": "Go to Studio",
    "cta.goSign": "Go to signatures",
    "cta.goMyCerts": "View my documents",
  },
  es: {
    "landing.heroTitlePre": "Certificados on-chain de",
    "landing.heroSubtitle":
      "Firmados por quienes responden por el curso, verificables por cualquier persona, con traza de auditoría completa.",
    "landing.verifyCta": "Verificar un documento",

    "landing.verify.demo.tag": "Demostración",
    "landing.verify.demo.title": "Verificar un certificado",
    "landing.verify.demo.label": "Código de validación o dirección on-chain",
    "landing.verify.demo.placeholder": "Pega el código o la dirección",
    "landing.verify.demo.cta": "Verificar",
    "landing.verify.demo.checking": "Verificando…",
    "landing.verify.demo.opening": "Abriendo la verificación…",
    "landing.verify.demo.hint":
      "Vista previa interactiva — la verificación real se abre en la pantalla de verificación.",
    "landing.verify.demo.fallback": "Abrir la verificación completa",

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

    "landing.chip.verifiable": "Verificable por cualquier persona",
    "landing.chip.multisig": "Firma multifirmante",
    "landing.chip.onchain": "Registro on-chain",
    "landing.chip.lgpd": "LGPD: solo el hash",

    "landing.seal.docTitle": "Certificado",
    "landing.seal.badge": "Verificado on-chain",
    "landing.seal.signedBy": "Firmado on-chain",

    "landing.eyebrow.start": "Empieza aquí",
    "landing.eyebrow.features": "Por dentro",
    "landing.eyebrow.trust": "Confianza",
    "landing.eyebrow.how": "El proceso",

    "landing.chooseSubtitle": "Tres puertas de entrada — elige la tuya.",
    "landing.card.issue.tag": "Para organizaciones",
    "landing.card.verify.tag": "Para cualquier persona",
    "landing.card.events.tag": "Para organizadores",

    "landing.features.title": "Por qué es confiable",
    "landing.features.subtitle": "Mecanismos abiertos, no promesas.",
    "landing.feature.audit.title": "Traza de auditoría completa",
    "landing.feature.audit.desc":
      "Cada solicitud, firma y emisión queda registrada públicamente en Solana — de la solicitud al certificado final.",
    "landing.feature.nontransfer.title": "Intransferible",
    "landing.feature.nontransfer.desc":
      "Emitido a nombre de quien lo obtuvo — no puede venderse ni transferirse.",
    "landing.feature.open.title": "Verificación abierta",
    "landing.feature.open.desc":
      "Cualquiera lo comprueba por código, dirección on-chain o archivo.",
    "landing.feature.multisig.title": "Múltiples firmas",
    "landing.feature.multisig.desc":
      "Cada responsable del curso firma on-chain antes de la emisión.",
    "landing.feature.privacy.title": "Privacidad por defecto",
    "landing.feature.privacy.desc":
      "Los datos personales no van a la blockchain — solo el hash del documento.",

    "landing.trust.title": "Base legal y técnica",
    "landing.trust.mp.label": "MP 2.200-2/2001",
    "landing.trust.mp.sub": "Firma electrónica",
    "landing.trust.law.label": "Ley 14.063/2020",
    "landing.trust.law.sub": "Uso entre las partes",
    "landing.trust.timestamp.label": "Sello de tiempo on-chain",
    "landing.trust.timestamp.sub": "Registrado en Solana",
    "landing.trust.public.label": "Registro público",
    "landing.trust.public.sub": "Comprobable en cualquier momento",
    "landing.trust.lgpd.label": "LGPD",
    "landing.trust.lgpd.sub": "Solo el hash on-chain",

    "landing.howSubtitle": "De la solicitud al certificado, en tres pasos.",
    "cta.goStudio": "Ir al Studio",
    "cta.goSign": "Ir a las firmas",
    "cta.goMyCerts": "Ver mis documentos",
  },
};
