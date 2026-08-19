import type { Locale } from "../locales";

/** Landing page (app/page.tsx + landing-cta). */
const pt = {
  "landing.heroTitlePre": "Certificados on-chain da",
  "landing.heroSubtitle":
    "Emitidos por quem assina, verificáveis por qualquer pessoa, para sempre.",
  "landing.verifyCta": "Verificar um certificado",
  "landing.howItWorks": "Como funciona",
  "landing.step1.title": "Solicite",
  "landing.step1.desc":
    "Encontre a edição do seu curso ou evento e envie seu nome para certificação.",
  "landing.step2.title": "Assinaturas on-chain",
  "landing.step2.desc":
    "Cada signatário designado assina sua solicitação diretamente na Solana.",
  "landing.step3.title": "NFT intransferível",
  "landing.step3.desc":
    "Com todas as assinaturas, resgate seu certificado como um NFT soulbound — seu, para sempre.",
  "landing.network": "Rede: Devnet",
  "landing.program": "Programa",
  "landing.programPending": "Programa: aguardando deploy",
  "landing.publicRecord":
    "Toda solicitação, assinatura e emissão fica registrada publicamente na blockchain Solana.",
  "cta.goAdmin": "Ir para a administração",
  "cta.goCertificator": "Ir para o certificador",
  "cta.goMyCerts": "Ver meus certificados",
} as const;

export type LandingKey = keyof typeof pt;

export const landingDict: Record<Locale, Record<LandingKey, string>> = {
  "pt-BR": pt,
  en: {
    "landing.heroTitlePre": "On-chain certificates by",
    "landing.heroSubtitle":
      "Issued by their signers, verifiable by anyone, forever.",
    "landing.verifyCta": "Verify a certificate",
    "landing.howItWorks": "How it works",
    "landing.step1.title": "Request",
    "landing.step1.desc":
      "Find your course or event edition and submit your name for certification.",
    "landing.step2.title": "On-chain signatures",
    "landing.step2.desc":
      "Each designated signer signs your request directly on Solana.",
    "landing.step3.title": "Non-transferable NFT",
    "landing.step3.desc":
      "Once every signature is in, claim your certificate as a soulbound NFT — yours, forever.",
    "landing.network": "Network: Devnet",
    "landing.program": "Program",
    "landing.programPending": "Program: awaiting deploy",
    "landing.publicRecord":
      "Every request, signature and issuance is publicly recorded on the Solana blockchain.",
    "cta.goAdmin": "Go to admin",
    "cta.goCertificator": "Go to the certifier",
    "cta.goMyCerts": "View my certificates",
  },
  es: {
    "landing.heroTitlePre": "Certificados on-chain de",
    "landing.heroSubtitle":
      "Emitidos por quienes firman, verificables por cualquier persona, para siempre.",
    "landing.verifyCta": "Verificar un certificado",
    "landing.howItWorks": "Cómo funciona",
    "landing.step1.title": "Solicita",
    "landing.step1.desc":
      "Encuentra la edición de tu curso o evento y envía tu nombre para la certificación.",
    "landing.step2.title": "Firmas on-chain",
    "landing.step2.desc":
      "Cada firmante designado firma tu solicitud directamente en Solana.",
    "landing.step3.title": "NFT intransferible",
    "landing.step3.desc":
      "Con todas las firmas, reclama tu certificado como un NFT soulbound — tuyo, para siempre.",
    "landing.network": "Red: Devnet",
    "landing.program": "Programa",
    "landing.programPending": "Programa: esperando el deploy",
    "landing.publicRecord":
      "Cada solicitud, firma y emisión queda registrada públicamente en la blockchain de Solana.",
    "cta.goAdmin": "Ir a la administración",
    "cta.goCertificator": "Ir al certificador",
    "cta.goMyCerts": "Ver mis certificados",
  },
};
