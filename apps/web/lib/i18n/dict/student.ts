import type { Locale } from "../locales";

/**
 * Student-facing flows: editions browse/detail, request form, my certificates,
 * claim. See dict/common.ts for the pattern — `pt` is the source of truth for
 * the key set. Strings shared with the claim surface (claim.*, nav.*) are
 * reused from common.ts rather than duplicated here.
 */
const pt = {
  "editions.metaTitle": "Edições | Superteam Certify",
  "editions.detailMetaTitle": "Edição | Superteam Certify",
  "editions.notFoundMetaTitle": "Edição não encontrada",
  "editions.title": "Edições",
  "editions.subtitle":
    "Escolha a turma do seu curso para solicitar seu certificado.",
  "editions.dbUnconfiguredTitle": "Supabase não configurado",
  "editions.dbUnconfiguredDesc":
    "As edições ainda não podem ser carregadas. Configure o Supabase e recarregue esta página.",
  "editions.detailDbUnconfiguredDesc":
    "Esta edição não pode ser carregada no momento.",
  "editions.emptyTitle": "Nenhuma edição aberta no momento",
  "editions.emptyDesc":
    "Volte em breve — novas edições aparecem aqui assim que forem abertas.",
  "editions.status.open": "Aberta",
  "editions.status.paused": "Pausada",
  "editions.status.closed": "Encerrada",
  "editions.supplyWithMax": "{minted} de {max} certificados emitidos",
  "editions.supply": "{minted} certificados emitidos",
  "editions.mintedShort": "{minted}/{max} emitidos",
  "editions.signers": "Signatários",
  "editions.pausedTitle": "Esta edição ainda não está aberta",
  "editions.pausedDesc":
    "Volte em breve — as solicitações abrem assim que os administradores publicarem esta edição.",
  "editions.closedTitle": "Esta edição está encerrada",
  "editions.closedDesc":
    "Não é mais possível solicitar novos certificados para esta edição.",
  "editions.supplyExhaustedTitle": "Limite de certificados atingido",
  "editions.supplyExhaustedDesc":
    "Esta edição atingiu o número máximo de certificados.",
  "me.title": "Meus documentos",
  "me.subtitle": "Seus certificados e presenças, reunidos em um só lugar.",
  "me.loadErrorTitle": "Falha ao carregar seus certificados",
  "me.loadErrorDesc": "Tente novamente em instantes.",
  "me.retry": "Tentar novamente",
  "me.emptyTitle": "Você ainda não tem certificados",
  "me.emptyDesc": "Encontre uma edição aberta para solicitar o seu.",
  "me.browseEditions": "Ver edições abertas",
  "me.certificates.title": "Certificados",
  "me.attendance.title": "Presenças",
  "me.attendance.loadErrorTitle": "Falha ao carregar suas presenças",
  "me.attendance.emptyTitle": "Você ainda não tem presenças",
  "me.attendance.emptyDesc":
    "Participou de um evento? Escaneie o QR code do organizador para resgatar seu NFT de presença — ele aparece aqui.",
  "me.attendance.claimedAt": "Resgatado em {date}",
  "me.attendance.view": "Ver presença",
  "me.attendance.viewTx": "Ver transação",
  "me.lowBalance.title": "Saldo insuficiente para resgatar",
  "me.lowBalance.desc":
    "O resgate paga uma taxa de rede em SOL e sua carteira não tem saldo suficiente. Na devnet, você pode pedir SOL de teste.",
  "me.lowBalance.recheck": "Verificar saldo novamente",
  "me.claim.consentTitle": "Antes de resgatar",
  "me.claim.consentPoint1":
    "Você assina com sua carteira — uma janela vai abrir para você confirmar.",
  "me.claim.consentPoint2":
    "Seu certificado é emitido na blockchain: o endereço da sua carteira e as datas de assinatura ficam registrados publicamente, de forma permanente.",
  "me.claim.consentPoint3":
    "Você recebe um link de verificação para compartilhar com quem quiser.",
  "me.claim.consentAccept": "Entendi, quero resgatar",
  "me.claim.signAction": "Assinar e resgatar",
  "me.claim.signCaption":
    "Uma janela da sua carteira vai abrir para você confirmar.",
  "me.claim.issuingCaption":
    "Isso leva alguns segundos. Pode deixar esta página aberta.",
  "me.claim.doneTitle": "Seu certificado está pronto",
  "me.claim.doneDesc":
    "Guarde o link de verificação — com ele qualquer pessoa pode conferir o registro deste certificado.",
  "me.claim.downloadPng": "Baixar PNG",
  "me.claim.downloadPdf": "Baixar PDF",
  "me.claim.shareWhatsapp": "WhatsApp",
  "me.claim.shareLinkedin": "LinkedIn",
  "me.claim.shareMessage":
    "Acabei de receber meu certificado de {edition}. Confira aqui:",
  "student.requestCertificate": "Solicitar certificado",
  "student.signInPrompt": "Entre para solicitar seu certificado nesta edição.",
  "student.noWalletTitle": "Nenhuma carteira encontrada",
  "student.noWalletDesc":
    "Sua conta ainda não tem uma carteira Solana associada. Tente sair e entrar novamente.",
  "student.nameLabel": "Seu nome completo",
  "student.namePlaceholder": "Como você quer que apareça no certificado",
  "student.namePreview": "Aparecerá como:",
  "student.consent":
    "Entendo que meu endereço de carteira e as datas de assinatura ficam registrados publicamente na blockchain, de forma permanente.",
  "student.requestSuccess": "Certificado solicitado com sucesso!",
  "student.stage.preparing": "Preparando…",
  "student.stage.signing": "Aguardando sua assinatura",
  "student.walletNotFound":
    "Carteira não encontrada. Reconecte e tente novamente.",
  "student.walletNoSign": "Esta carteira não suporta assinatura de transações.",
  "student.signatureCancelled": "Assinatura cancelada.",
  "student.claimWalletNotFound":
    "Carteira do certificado não encontrada. Reconecte e tente novamente.",
  "student.status.requested": "Em andamento",
  "student.status.fullySigned": "Pronto para resgatar",
  "student.status.claimed": "Resgatado",
  "student.status.revoked": "Revogado",
  "student.status.rejected": "Rejeitado",
  "student.rejectedTitle": "Solicitação rejeitada",
  "student.rejectedNoReason": "Nenhum motivo foi informado.",
  "student.requestAgain": "Solicitar novamente",
  "student.revokedTitle": "Certificado revogado",
  "student.revokedNoReason":
    "Este certificado não é mais válido para verificação.",
  "student.certImageAlt": "Certificado de {name}",
  "student.timeline.requested": "Solicitado",
  "student.timeline.signatures": "Assinaturas",
  "student.timeline.ready": "Pronto",
  "student.timeline.issuance": "Emissão",
  "student.timeline.complete": "Concluído",
  "student.timeline.aria": "Progresso do certificado",
  "student.timeline.signed": "assinado",
  "student.timeline.awaitingSignature": "aguardando assinatura",
  "student.mintFailed":
    "A emissão do certificado não concluiu automaticamente.",
  "student.mintRetry": "Tentar emitir novamente",
} as const;

export type studentKey = keyof typeof pt;

export const studentDict: Record<Locale, Record<studentKey, string>> = {
  "pt-BR": pt,
  en: {
    "editions.metaTitle": "Editions | Superteam Certify",
    "editions.detailMetaTitle": "Edition | Superteam Certify",
    "editions.notFoundMetaTitle": "Edition not found",
    "editions.title": "Editions",
    "editions.subtitle":
      "Pick your course's class to request your certificate.",
    "editions.dbUnconfiguredTitle": "Supabase not configured",
    "editions.dbUnconfiguredDesc":
      "Editions can't be loaded yet. Configure Supabase and reload this page.",
    "editions.detailDbUnconfiguredDesc":
      "This edition can't be loaded right now.",
    "editions.emptyTitle": "No open editions right now",
    "editions.emptyDesc":
      "Check back soon — new editions show up here as soon as they open.",
    "editions.status.open": "Open",
    "editions.status.paused": "Paused",
    "editions.status.closed": "Closed",
    "editions.supplyWithMax": "{minted} of {max} certificates issued",
    "editions.supply": "{minted} certificates issued",
    "editions.mintedShort": "{minted}/{max} issued",
    "editions.signers": "Signers",
    "editions.pausedTitle": "This edition isn't open yet",
    "editions.pausedDesc":
      "Check back soon — requests open as soon as the admins publish this edition.",
    "editions.closedTitle": "This edition is closed",
    "editions.closedDesc":
      "New certificates can no longer be requested for this edition.",
    "editions.supplyExhaustedTitle": "Certificate limit reached",
    "editions.supplyExhaustedDesc":
      "This edition has reached its maximum number of certificates.",
    "me.title": "My documents",
    "me.subtitle": "Your certificates and attendances, all in one place.",
    "me.loadErrorTitle": "Couldn't load your certificates",
    "me.loadErrorDesc": "Try again in a moment.",
    "me.retry": "Try again",
    "me.emptyTitle": "You don't have any certificates yet",
    "me.emptyDesc": "Find an open edition to request yours.",
    "me.browseEditions": "View open editions",
    "me.certificates.title": "Certificates",
    "me.attendance.title": "Attendances",
    "me.attendance.loadErrorTitle": "Couldn't load your attendances",
    "me.attendance.emptyTitle": "You don't have any attendances yet",
    "me.attendance.emptyDesc":
      "Went to an event? Scan the organizer's QR code to claim your attendance NFT — it shows up here.",
    "me.attendance.claimedAt": "Claimed on {date}",
    "me.attendance.view": "View attendance",
    "me.attendance.viewTx": "View transaction",
    "me.lowBalance.title": "Not enough balance to claim",
    "me.lowBalance.desc":
      "Claiming pays a network fee in SOL and your wallet is short. On devnet you can request test SOL.",
    "me.lowBalance.recheck": "Check balance again",
    "me.claim.consentTitle": "Before you claim",
    "me.claim.consentPoint1":
      "You sign with your wallet — a window will open for you to confirm.",
    "me.claim.consentPoint2":
      "Your certificate is issued on the blockchain: your wallet address and the signature dates are recorded publicly, permanently.",
    "me.claim.consentPoint3":
      "You get a verification link to share with anyone you like.",
    "me.claim.consentAccept": "Got it, claim my certificate",
    "me.claim.signAction": "Sign and claim",
    "me.claim.signCaption": "A wallet window will open for you to confirm.",
    "me.claim.issuingCaption":
      "This takes a few seconds. You can leave this page open.",
    "me.claim.doneTitle": "Your certificate is ready",
    "me.claim.doneDesc":
      "Keep the verification link — anyone can use it to check this certificate's record.",
    "me.claim.downloadPng": "Download PNG",
    "me.claim.downloadPdf": "Download PDF",
    "me.claim.shareWhatsapp": "WhatsApp",
    "me.claim.shareLinkedin": "LinkedIn",
    "me.claim.shareMessage":
      "I just received my {edition} certificate. Check it here:",
    "student.requestCertificate": "Request certificate",
    "student.signInPrompt":
      "Sign in to request your certificate for this edition.",
    "student.noWalletTitle": "No wallet found",
    "student.noWalletDesc":
      "Your account doesn't have a Solana wallet linked yet. Try signing out and back in.",
    "student.nameLabel": "Your full name",
    "student.namePlaceholder": "How you want it to appear on the certificate",
    "student.namePreview": "Will appear as:",
    "student.consent":
      "I understand that my wallet address and the signature dates are recorded publicly on the blockchain, permanently.",
    "student.requestSuccess": "Certificate requested successfully!",
    "student.stage.preparing": "Preparing…",
    "student.stage.signing": "Awaiting your signature",
    "student.walletNotFound": "Wallet not found. Reconnect and try again.",
    "student.walletNoSign": "This wallet doesn't support transaction signing.",
    "student.signatureCancelled": "Signature cancelled.",
    "student.claimWalletNotFound":
      "The certificate's wallet was not found. Reconnect and try again.",
    "student.status.requested": "In progress",
    "student.status.fullySigned": "Ready to claim",
    "student.status.claimed": "Claimed",
    "student.status.revoked": "Revoked",
    "student.status.rejected": "Rejected",
    "student.rejectedTitle": "Request rejected",
    "student.rejectedNoReason": "No reason was given.",
    "student.requestAgain": "Request again",
    "student.revokedTitle": "Certificate revoked",
    "student.revokedNoReason":
      "This certificate is no longer valid for verification.",
    "student.certImageAlt": "Certificate of {name}",
    "student.timeline.requested": "Requested",
    "student.timeline.signatures": "Signatures",
    "student.timeline.ready": "Ready",
    "student.timeline.issuance": "Issuance",
    "student.timeline.complete": "Complete",
    "student.timeline.aria": "Certificate progress",
    "student.timeline.signed": "signed",
    "student.timeline.awaitingSignature": "awaiting signature",
    "student.mintFailed":
      "The certificate issuance didn't complete automatically.",
    "student.mintRetry": "Try issuing again",
  },
  es: {
    "editions.metaTitle": "Ediciones | Superteam Certify",
    "editions.detailMetaTitle": "Edición | Superteam Certify",
    "editions.notFoundMetaTitle": "Edición no encontrada",
    "editions.title": "Ediciones",
    "editions.subtitle":
      "Elige la clase de tu curso para solicitar tu certificado.",
    "editions.dbUnconfiguredTitle": "Supabase no configurado",
    "editions.dbUnconfiguredDesc":
      "Las ediciones aún no pueden cargarse. Configura Supabase y recarga esta página.",
    "editions.detailDbUnconfiguredDesc":
      "Esta edición no puede cargarse en este momento.",
    "editions.emptyTitle": "Ninguna edición abierta en este momento",
    "editions.emptyDesc":
      "Vuelve pronto — las nuevas ediciones aparecen aquí en cuanto se abren.",
    "editions.status.open": "Abierta",
    "editions.status.paused": "Pausada",
    "editions.status.closed": "Cerrada",
    "editions.supplyWithMax": "{minted} de {max} certificados emitidos",
    "editions.supply": "{minted} certificados emitidos",
    "editions.mintedShort": "{minted}/{max} emitidos",
    "editions.signers": "Firmantes",
    "editions.pausedTitle": "Esta edición aún no está abierta",
    "editions.pausedDesc":
      "Vuelve pronto — las solicitudes se abren en cuanto los administradores publiquen esta edición.",
    "editions.closedTitle": "Esta edición está cerrada",
    "editions.closedDesc":
      "Ya no es posible solicitar nuevos certificados para esta edición.",
    "editions.supplyExhaustedTitle": "Límite de certificados alcanzado",
    "editions.supplyExhaustedDesc":
      "Esta edición alcanzó el número máximo de certificados.",
    "me.title": "Mis documentos",
    "me.subtitle": "Tus certificados y asistencias, reunidos en un solo lugar.",
    "me.loadErrorTitle": "No se pudieron cargar tus certificados",
    "me.loadErrorDesc": "Inténtalo de nuevo en unos instantes.",
    "me.retry": "Intentar de nuevo",
    "me.emptyTitle": "Aún no tienes certificados",
    "me.emptyDesc": "Encuentra una edición abierta para solicitar el tuyo.",
    "me.browseEditions": "Ver ediciones abiertas",
    "me.certificates.title": "Certificados",
    "me.attendance.title": "Asistencias",
    "me.attendance.loadErrorTitle": "No se pudieron cargar tus asistencias",
    "me.attendance.emptyTitle": "Aún no tienes asistencias",
    "me.attendance.emptyDesc":
      "¿Fuiste a un evento? Escanea el código QR del organizador para reclamar tu NFT de asistencia — aparecerá aquí.",
    "me.attendance.claimedAt": "Reclamado el {date}",
    "me.attendance.view": "Ver asistencia",
    "me.attendance.viewTx": "Ver transacción",
    "me.lowBalance.title": "Saldo insuficiente para reclamar",
    "me.lowBalance.desc":
      "Reclamar paga una tarifa de red en SOL y tu cartera no tiene saldo suficiente. En devnet puedes pedir SOL de prueba.",
    "me.lowBalance.recheck": "Comprobar el saldo de nuevo",
    "me.claim.consentTitle": "Antes de reclamar",
    "me.claim.consentPoint1":
      "Firmas con tu cartera — se abrirá una ventana para que confirmes.",
    "me.claim.consentPoint2":
      "Tu certificado se emite en la blockchain: la dirección de tu cartera y las fechas de firma quedan registradas públicamente, de forma permanente.",
    "me.claim.consentPoint3":
      "Recibes un enlace de verificación para compartir con quien quieras.",
    "me.claim.consentAccept": "Entendido, quiero reclamar",
    "me.claim.signAction": "Firmar y reclamar",
    "me.claim.signCaption":
      "Se abrirá una ventana de tu cartera para que confirmes.",
    "me.claim.issuingCaption":
      "Esto tarda unos segundos. Puedes dejar esta página abierta.",
    "me.claim.doneTitle": "Tu certificado está listo",
    "me.claim.doneDesc":
      "Guarda el enlace de verificación — con él cualquiera puede consultar el registro de este certificado.",
    "me.claim.downloadPng": "Descargar PNG",
    "me.claim.downloadPdf": "Descargar PDF",
    "me.claim.shareWhatsapp": "WhatsApp",
    "me.claim.shareLinkedin": "LinkedIn",
    "me.claim.shareMessage":
      "Acabo de recibir mi certificado de {edition}. Míralo aquí:",
    "student.requestCertificate": "Solicitar certificado",
    "student.signInPrompt":
      "Inicia sesión para solicitar tu certificado en esta edición.",
    "student.noWalletTitle": "No se encontró ninguna cartera",
    "student.noWalletDesc":
      "Tu cuenta aún no tiene una cartera de Solana asociada. Intenta cerrar sesión y volver a entrar.",
    "student.nameLabel": "Tu nombre completo",
    "student.namePlaceholder": "Cómo quieres que aparezca en el certificado",
    "student.namePreview": "Aparecerá como:",
    "student.consent":
      "Entiendo que mi dirección de cartera y las fechas de firma quedan registradas públicamente en la blockchain, de forma permanente.",
    "student.requestSuccess": "¡Certificado solicitado con éxito!",
    "student.stage.preparing": "Preparando…",
    "student.stage.signing": "Esperando tu firma",
    "student.walletNotFound":
      "Cartera no encontrada. Vuelve a conectarla e inténtalo de nuevo.",
    "student.walletNoSign": "Esta cartera no admite la firma de transacciones.",
    "student.signatureCancelled": "Firma cancelada.",
    "student.claimWalletNotFound":
      "No se encontró la cartera del certificado. Vuelve a conectarla e inténtalo de nuevo.",
    "student.status.requested": "En curso",
    "student.status.fullySigned": "Listo para reclamar",
    "student.status.claimed": "Reclamado",
    "student.status.revoked": "Revocado",
    "student.status.rejected": "Rechazado",
    "student.rejectedTitle": "Solicitud rechazada",
    "student.rejectedNoReason": "No se indicó ningún motivo.",
    "student.requestAgain": "Solicitar de nuevo",
    "student.revokedTitle": "Certificado revocado",
    "student.revokedNoReason":
      "Este certificado ya no es válido para su verificación.",
    "student.certImageAlt": "Certificado de {name}",
    "student.timeline.requested": "Solicitado",
    "student.timeline.signatures": "Firmas",
    "student.timeline.ready": "Listo",
    "student.timeline.issuance": "Emisión",
    "student.timeline.complete": "Completado",
    "student.timeline.aria": "Progreso del certificado",
    "student.timeline.signed": "firmado",
    "student.timeline.awaitingSignature": "esperando firma",
    "student.mintFailed":
      "La emisión del certificado no se completó automáticamente.",
    "student.mintRetry": "Intentar emitir de nuevo",
  },
};
