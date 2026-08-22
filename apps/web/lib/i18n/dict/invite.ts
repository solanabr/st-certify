import type { Locale } from "../locales";

/**
 * Signer invite acceptance (`/invite/[token]`) — the page the invite and
 * reminder e-mails link to. Every dead-state string names a next step, because
 * the person reading it was sent here by someone else and has no other way in.
 */
const pt = {
  "invite.meta.title": "Convite para assinar · Superteam Certify",
  "invite.eyebrow": "Convite",
  "invite.greeting": "Olá, {name}.",
  "invite.invitedAs":
    "Você foi convidado a assinar como Signatário ({role}) da edição {edition}.",
  "invite.whatItMeans":
    "Ao confirmar, sua carteira passa a valer como uma das assinaturas exigidas em cada certificado desta edição.",

  "invite.login.title": "Entre para confirmar",
  "invite.login.body":
    "Use o mesmo e-mail em que recebeu este convite. Sua conta é o que garante que só você pode confirmar este assento.",
  "invite.login.cta": "Entrar",

  "invite.wallet.title": "Escolha a carteira que vai assinar",
  "invite.wallet.body":
    "Esta carteira identifica você em cada assinatura desta edição. Depois de confirmada, ela não pode ser trocada por aqui.",
  "invite.wallet.select": "Usar a carteira {wallet}",
  "invite.wallet.confirm": "Confirmar assento",
  "invite.wallet.confirming": "Confirmando…",
  "invite.wallet.addAnother": "Vincular outra carteira",

  "invite.createWallet.title": "Você ainda não tem uma carteira",
  "invite.createWallet.body":
    "Crie uma agora — ela guarda sua assinatura e fica vinculada à sua conta. Leva alguns segundos e não exige nada instalado.",
  "invite.createWallet.cta": "Criar carteira",
  "invite.createWallet.creating": "Criando…",
  "invite.createWallet.link": "Já tenho uma carteira",

  "invite.accepted.title": "Assento confirmado",
  "invite.accepted.body":
    "Sua carteira está registrada como Signatário de {edition}. Os certificados aparecem em Assinaturas assim que os alunos solicitarem.",
  "invite.accepted.walletLabel": "Carteira confirmada",
  "invite.accepted.cta": "Ir para Assinaturas",

  "invite.dead.notFoundTitle": "Link inválido",
  "invite.dead.notFoundBody":
    "Este convite não existe ou o endereço foi copiado pela metade. Abra o link direto do e-mail que você recebeu.",
  "invite.dead.expiredTitle": "Convite expirado",
  "invite.dead.expiredBody":
    "Este convite não vale mais. Quem organizou a edição consegue enviar um novo link.",
  "invite.dead.closedTitle": "Edição já criada",
  "invite.dead.closedBody":
    "Esta edição foi criada on-chain antes da sua confirmação, e o conjunto de signatários não muda mais.",
  "invite.dead.contactLink": "Falar com {issuer}",
  "invite.dead.contactName": "Procure {issuer}, quem emite esta edição.",
  "invite.dead.contactUnknown":
    "Responda ao e-mail do convite para falar com quem organizou a edição.",
  "invite.dead.home": "Voltar ao início",
  "invite.dead.wrongAccountTitle": "Convite enviado para outro e-mail",
  "invite.dead.wrongAccountBody":
    "Este convite foi enviado para outro endereço de e-mail. Saia desta conta e entre com o e-mail que recebeu o convite para confirmar seu assento.",
};

export type inviteKey = keyof typeof pt;

export const inviteDict: Record<Locale, Record<inviteKey, string>> = {
  "pt-BR": pt,
  en: {
    "invite.meta.title": "Invitation to sign · Superteam Certify",
    "invite.eyebrow": "Invitation",
    "invite.greeting": "Hi, {name}.",
    "invite.invitedAs":
      "You have been invited to sign as a signer ({role}) for {edition}.",
    "invite.whatItMeans":
      "Once you confirm, your wallet counts as one of the signatures required on every certificate in this edition.",

    "invite.login.title": "Sign in to confirm",
    "invite.login.body":
      "Use the same e-mail this invitation reached. Your account is what guarantees only you can confirm this seat.",
    "invite.login.cta": "Sign in",

    "invite.wallet.title": "Choose the wallet that will sign",
    "invite.wallet.body":
      "This wallet identifies you on every signature in this edition. Once confirmed, it cannot be swapped here.",
    "invite.wallet.select": "Use wallet {wallet}",
    "invite.wallet.confirm": "Confirm seat",
    "invite.wallet.confirming": "Confirming…",
    "invite.wallet.addAnother": "Link another wallet",

    "invite.createWallet.title": "You don't have a wallet yet",
    "invite.createWallet.body":
      "Create one now — it holds your signature and stays linked to your account. It takes seconds and needs nothing installed.",
    "invite.createWallet.cta": "Create wallet",
    "invite.createWallet.creating": "Creating…",
    "invite.createWallet.link": "I already have a wallet",

    "invite.accepted.title": "Seat confirmed",
    "invite.accepted.body":
      "Your wallet is registered as a signer for {edition}. Certificates show up under Signatures as soon as students request them.",
    "invite.accepted.walletLabel": "Confirmed wallet",
    "invite.accepted.cta": "Go to Signatures",

    "invite.dead.notFoundTitle": "Invalid link",
    "invite.dead.notFoundBody":
      "This invitation doesn't exist, or the address was copied halfway. Open the link straight from the e-mail you received.",
    "invite.dead.expiredTitle": "Invitation expired",
    "invite.dead.expiredBody":
      "This invitation is no longer valid. Whoever organised the edition can send a new link.",
    "invite.dead.closedTitle": "Edition already created",
    "invite.dead.closedBody":
      "This edition went on-chain before your confirmation, and its set of signers no longer changes.",
    "invite.dead.contactLink": "Contact {issuer}",
    "invite.dead.contactName":
      "Reach out to {issuer}, who issues this edition.",
    "invite.dead.contactUnknown":
      "Reply to the invitation e-mail to reach whoever organised the edition.",
    "invite.dead.home": "Back to home",
    "invite.dead.wrongAccountTitle": "Invitation sent to another e-mail",
    "invite.dead.wrongAccountBody":
      "This invitation was sent to a different e-mail address. Sign out and sign back in with the e-mail that received it to confirm your seat.",
  },
  es: {
    "invite.meta.title": "Invitación para firmar · Superteam Certify",
    "invite.eyebrow": "Invitación",
    "invite.greeting": "Hola, {name}.",
    "invite.invitedAs":
      "Te invitaron a firmar como firmante ({role}) de la edición {edition}.",
    "invite.whatItMeans":
      "Al confirmar, tu billetera pasa a valer como una de las firmas exigidas en cada certificado de esta edición.",

    "invite.login.title": "Inicia sesión para confirmar",
    "invite.login.body":
      "Usa el mismo correo en el que recibiste esta invitación. Tu cuenta es lo que garantiza que solo tú puedas confirmar este puesto.",
    "invite.login.cta": "Iniciar sesión",

    "invite.wallet.title": "Elige la billetera que va a firmar",
    "invite.wallet.body":
      "Esta billetera te identifica en cada firma de esta edición. Una vez confirmada, no se puede cambiar por aquí.",
    "invite.wallet.select": "Usar la billetera {wallet}",
    "invite.wallet.confirm": "Confirmar puesto",
    "invite.wallet.confirming": "Confirmando…",
    "invite.wallet.addAnother": "Vincular otra billetera",

    "invite.createWallet.title": "Todavía no tienes una billetera",
    "invite.createWallet.body":
      "Crea una ahora — guarda tu firma y queda vinculada a tu cuenta. Toma unos segundos y no requiere instalar nada.",
    "invite.createWallet.cta": "Crear billetera",
    "invite.createWallet.creating": "Creando…",
    "invite.createWallet.link": "Ya tengo una billetera",

    "invite.accepted.title": "Puesto confirmado",
    "invite.accepted.body":
      "Tu billetera está registrada como firmante de {edition}. Los certificados aparecen en Firmas apenas los alumnos los soliciten.",
    "invite.accepted.walletLabel": "Billetera confirmada",
    "invite.accepted.cta": "Ir a Firmas",

    "invite.dead.notFoundTitle": "Enlace inválido",
    "invite.dead.notFoundBody":
      "Esta invitación no existe o la dirección se copió a medias. Abre el enlace directo del correo que recibiste.",
    "invite.dead.expiredTitle": "Invitación vencida",
    "invite.dead.expiredBody":
      "Esta invitación ya no vale. Quien organizó la edición puede enviarte un enlace nuevo.",
    "invite.dead.closedTitle": "La edición ya fue creada",
    "invite.dead.closedBody":
      "Esta edición se creó on-chain antes de tu confirmación, y su conjunto de firmantes ya no cambia.",
    "invite.dead.contactLink": "Hablar con {issuer}",
    "invite.dead.contactName": "Contacta a {issuer}, quien emite esta edición.",
    "invite.dead.contactUnknown":
      "Responde al correo de la invitación para hablar con quien organizó la edición.",
    "invite.dead.home": "Volver al inicio",
    "invite.dead.wrongAccountTitle": "La invitación se envió a otro correo",
    "invite.dead.wrongAccountBody":
      "Esta invitación se envió a otra dirección de correo. Cierra sesión y vuelve a entrar con el correo que la recibió para confirmar tu puesto.",
  },
};
