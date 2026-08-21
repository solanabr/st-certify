import type { Locale } from "../locales";

/**
 * Transactional email copy (lib/email/templates.ts). Every claim here is bound
 * by the forbidden-claims list in the overhaul spec §14 — no "assinatura
 * qualificada", no ICP-Brasil, no MEC/diploma/cartório equivalence, no
 * "impossível de falsificar". lib/email/__tests__/templates.test.ts fails the
 * build if any of them reappears in a rendered email.
 *
 * Kinds with a `{count}` come in `…One` / `…Many` pairs: the dict has no
 * plural machinery, and "1 certificado(s)" is not copy anyone should ship.
 */
const pt = {
  "email.layout.brand": "Superteam Certify",
  "email.layout.ctaFallback":
    "Se o botão não funcionar, copie e cole este endereço no seu navegador:",
  "email.layout.footerIssuer": "Enviado por {issuer}.",
  "email.layout.footerNoReply":
    "Este é um e-mail automático — não responda a esta mensagem.",
  "email.common.reasonLabel": "Motivo informado:",
  "email.common.noReason": "Nenhum motivo foi informado.",

  "email.signerInvite.subject":
    "Convite para assinar os certificados de {editionName}",
  "email.signerInvite.heading": "Olá, {signerName}",
  "email.signerInvite.body":
    "Você foi convidado(a) a assinar os certificados de {editionName}.",
  "email.signerInvite.note":
    "Ao aceitar, você vincula sua carteira ao convite. Cada assinatura fica registrada com carimbo de tempo público e independente.",
  "email.signerInvite.cta": "Aceitar convite",

  "email.requestsPending.subjectOne": "1 certificado aguarda sua assinatura",
  "email.requestsPending.subjectMany":
    "{count} certificados aguardam sua assinatura",
  "email.requestsPending.heading": "Solicitações pendentes",
  "email.requestsPending.bodyOne":
    "Há 1 certificado de {editionName} aguardando sua assinatura.",
  "email.requestsPending.bodyMany":
    "Há {count} certificados de {editionName} aguardando sua assinatura.",
  "email.requestsPending.note":
    "Você pode revisar e assinar em lote na sua área de assinaturas.",
  "email.requestsPending.cta": "Ver solicitações",

  "email.certReady.subject": "Seu certificado de {editionName} está pronto",
  "email.certReady.heading": "Parabéns, {studentName}!",
  "email.certReady.body":
    "As assinaturas de {editionName} foram concluídas e seu certificado está pronto para ser emitido.",
  "email.certReady.note":
    "Abra sua área de certificados para emitir e baixar o documento.",
  "email.certReady.cta": "Emitir meu certificado",

  "email.certRejected.subject":
    "Sua solicitação em {editionName} não foi aprovada",
  "email.certRejected.heading": "Olá, {studentName}",
  "email.certRejected.body":
    "Sua solicitação de certificado em {editionName} não foi aprovada.",
  "email.certRejected.note":
    "Se você acredita que houve um engano, fale com quem organiza a turma para solicitar novamente.",

  "email.certRevoked.subject": "Seu certificado de {editionName} foi revogado",
  "email.certRevoked.heading": "Olá, {studentName}",
  "email.certRevoked.body":
    "O emissor revogou seu certificado de {editionName}. A página pública de verificação passa a exibi-lo como revogado.",
  "email.certRevoked.note":
    "Fale com quem organiza a turma se precisar de mais informações.",

  "email.claimReceipt.subject": "Recibo do seu certificado de {editionName}",
  "email.claimReceipt.heading": "Tudo certo, {studentName}!",
  "email.claimReceipt.body":
    "Seu certificado de {editionName} foi emitido e registrado on-chain.",
  "email.claimReceipt.pdfLabel": "Baixar o PDF do certificado",
  "email.claimReceipt.privacy":
    "Seus dados pessoais não são publicados em blockchain — apenas o hash do documento (LGPD).",
  "email.claimReceipt.cta": "Ver a verificação pública",

  "email.signerReminder.subjectOne":
    "Lembrete: 1 certificado aguarda sua assinatura",
  "email.signerReminder.subjectMany":
    "Lembrete: {count} certificados aguardam sua assinatura",
  "email.signerReminder.heading": "Lembrete de assinatura",
  "email.signerReminder.bodyOne":
    "A organização de {editionName} enviou um lembrete: há 1 certificado aguardando sua assinatura.",
  "email.signerReminder.bodyMany":
    "A organização de {editionName} enviou um lembrete: há {count} certificados aguardando sua assinatura.",
  "email.signerReminder.note":
    "Assim que todas as assinaturas forem coletadas, o certificado fica disponível para o aluno.",
  "email.signerReminder.cta": "Assinar agora",
} as const;

export type emailKey = keyof typeof pt;

export const emailDict: Record<Locale, Record<emailKey, string>> = {
  "pt-BR": pt,
  en: {
    "email.layout.brand": "Superteam Certify",
    "email.layout.ctaFallback":
      "If the button doesn't work, copy and paste this address into your browser:",
    "email.layout.footerIssuer": "Sent by {issuer}.",
    "email.layout.footerNoReply":
      "This is an automated message — please do not reply.",
    "email.common.reasonLabel": "Reason given:",
    "email.common.noReason": "No reason was given.",

    "email.signerInvite.subject":
      "You're invited to sign the certificates for {editionName}",
    "email.signerInvite.heading": "Hello, {signerName}",
    "email.signerInvite.body":
      "You've been invited to sign the certificates for {editionName}.",
    "email.signerInvite.note":
      "Accepting links your wallet to this invitation. Every signature is recorded with a public, independent timestamp.",
    "email.signerInvite.cta": "Accept invitation",

    "email.requestsPending.subjectOne":
      "1 certificate is waiting for your signature",
    "email.requestsPending.subjectMany":
      "{count} certificates are waiting for your signature",
    "email.requestsPending.heading": "Pending requests",
    "email.requestsPending.bodyOne":
      "1 certificate from {editionName} is waiting for your signature.",
    "email.requestsPending.bodyMany":
      "{count} certificates from {editionName} are waiting for your signature.",
    "email.requestsPending.note":
      "You can review and sign them as a batch in your signing area.",
    "email.requestsPending.cta": "View requests",

    "email.certReady.subject": "Your certificate for {editionName} is ready",
    "email.certReady.heading": "Congratulations, {studentName}!",
    "email.certReady.body":
      "All signatures for {editionName} are in, and your certificate is ready to be issued.",
    "email.certReady.note":
      "Open your certificates area to issue and download the document.",
    "email.certReady.cta": "Issue my certificate",

    "email.certRejected.subject":
      "Your request for {editionName} was not approved",
    "email.certRejected.heading": "Hello, {studentName}",
    "email.certRejected.body":
      "Your certificate request for {editionName} was not approved.",
    "email.certRejected.note":
      "If you believe this was a mistake, contact the course organizers to request it again.",

    "email.certRevoked.subject":
      "Your certificate for {editionName} was revoked",
    "email.certRevoked.heading": "Hello, {studentName}",
    "email.certRevoked.body":
      "The issuer revoked your certificate for {editionName}. The public verification page now shows it as revoked.",
    "email.certRevoked.note":
      "Contact the course organizers if you need more information.",

    "email.claimReceipt.subject": "Receipt for your {editionName} certificate",
    "email.claimReceipt.heading": "All set, {studentName}!",
    "email.claimReceipt.body":
      "Your certificate for {editionName} was issued and recorded on-chain.",
    "email.claimReceipt.pdfLabel": "Download the certificate PDF",
    "email.claimReceipt.privacy":
      "Your personal data is not published on the blockchain — only the document hash.",
    "email.claimReceipt.cta": "View the public verification",

    "email.signerReminder.subjectOne":
      "Reminder: 1 certificate is waiting for your signature",
    "email.signerReminder.subjectMany":
      "Reminder: {count} certificates are waiting for your signature",
    "email.signerReminder.heading": "Signature reminder",
    "email.signerReminder.bodyOne":
      "The {editionName} organizers sent a reminder: 1 certificate is waiting for your signature.",
    "email.signerReminder.bodyMany":
      "The {editionName} organizers sent a reminder: {count} certificates are waiting for your signature.",
    "email.signerReminder.note":
      "Once every signature is collected, the certificate becomes available to the student.",
    "email.signerReminder.cta": "Sign now",
  },
  es: {
    "email.layout.brand": "Superteam Certify",
    "email.layout.ctaFallback":
      "Si el botón no funciona, copia y pega esta dirección en tu navegador:",
    "email.layout.footerIssuer": "Enviado por {issuer}.",
    "email.layout.footerNoReply":
      "Este es un mensaje automático — no respondas a este correo.",
    "email.common.reasonLabel": "Motivo indicado:",
    "email.common.noReason": "No se indicó ningún motivo.",

    "email.signerInvite.subject":
      "Invitación para firmar los certificados de {editionName}",
    "email.signerInvite.heading": "Hola, {signerName}",
    "email.signerInvite.body":
      "Te invitaron a firmar los certificados de {editionName}.",
    "email.signerInvite.note":
      "Al aceptar, vinculas tu billetera a la invitación. Cada firma queda registrada con un sello de tiempo público e independiente.",
    "email.signerInvite.cta": "Aceptar invitación",

    "email.requestsPending.subjectOne": "1 certificado espera tu firma",
    "email.requestsPending.subjectMany":
      "{count} certificados esperan tu firma",
    "email.requestsPending.heading": "Solicitudes pendientes",
    "email.requestsPending.bodyOne":
      "Hay 1 certificado de {editionName} esperando tu firma.",
    "email.requestsPending.bodyMany":
      "Hay {count} certificados de {editionName} esperando tu firma.",
    "email.requestsPending.note":
      "Puedes revisarlos y firmarlos en lote desde tu área de firmas.",
    "email.requestsPending.cta": "Ver solicitudes",

    "email.certReady.subject": "Tu certificado de {editionName} está listo",
    "email.certReady.heading": "¡Felicitaciones, {studentName}!",
    "email.certReady.body":
      "Se completaron las firmas de {editionName} y tu certificado está listo para emitirse.",
    "email.certReady.note":
      "Abre tu área de certificados para emitir y descargar el documento.",
    "email.certReady.cta": "Emitir mi certificado",

    "email.certRejected.subject":
      "Tu solicitud en {editionName} no fue aprobada",
    "email.certRejected.heading": "Hola, {studentName}",
    "email.certRejected.body":
      "Tu solicitud de certificado en {editionName} no fue aprobada.",
    "email.certRejected.note":
      "Si crees que hubo un error, habla con quienes organizan el curso para solicitarlo de nuevo.",

    "email.certRevoked.subject": "Tu certificado de {editionName} fue revocado",
    "email.certRevoked.heading": "Hola, {studentName}",
    "email.certRevoked.body":
      "El emisor revocó tu certificado de {editionName}. La página pública de verificación ahora lo muestra como revocado.",
    "email.certRevoked.note":
      "Habla con quienes organizan el curso si necesitas más información.",

    "email.claimReceipt.subject":
      "Comprobante de tu certificado de {editionName}",
    "email.claimReceipt.heading": "¡Listo, {studentName}!",
    "email.claimReceipt.body":
      "Tu certificado de {editionName} fue emitido y registrado on-chain.",
    "email.claimReceipt.pdfLabel": "Descargar el PDF del certificado",
    "email.claimReceipt.privacy":
      "Tus datos personales no se publican en la blockchain — solo el hash del documento.",
    "email.claimReceipt.cta": "Ver la verificación pública",

    "email.signerReminder.subjectOne":
      "Recordatorio: 1 certificado espera tu firma",
    "email.signerReminder.subjectMany":
      "Recordatorio: {count} certificados esperan tu firma",
    "email.signerReminder.heading": "Recordatorio de firma",
    "email.signerReminder.bodyOne":
      "La organización de {editionName} envió un recordatorio: hay 1 certificado esperando tu firma.",
    "email.signerReminder.bodyMany":
      "La organización de {editionName} envió un recordatorio: hay {count} certificados esperando tu firma.",
    "email.signerReminder.note":
      "Cuando se reúnan todas las firmas, el certificado queda disponible para el estudiante.",
    "email.signerReminder.cta": "Firmar ahora",
  },
};
