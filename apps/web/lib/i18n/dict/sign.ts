import type { Locale } from "../locales";

/**
 * The signing ceremony around `/sign`'s batch table (spec §6.4): the consent
 * disclosure shown before the first wallet prompt of a session, and the
 * completion state that follows a batch. The table itself speaks through
 * dict/certificator.ts.
 *
 * The consent copy states what a signature attests, that the record is public
 * and permanent, and that it cannot be withdrawn. It deliberately claims
 * nothing about legal equivalence to any specific signature regime.
 */
const pt = {
  "sign.consent.title": "Antes de assinar",
  "sign.consent.lead":
    "Sua assinatura identifica você como Signatário destes certificados. Leia o que ela significa — este aviso aparece uma vez por sessão.",
  "sign.consent.attestTitle": "O que você declara",
  "sign.consent.attestBody":
    "Que conferiu o nome de cada aluno selecionado e que eles concluíram o que o certificado afirma.",
  "sign.consent.recordTitle": "Registro público e permanente",
  "sign.consent.recordBody":
    "Cada assinatura é gravada na blockchain Solana junto com a sua carteira. Qualquer pessoa pode consultar o registro, e ele não pode ser apagado.",
  "sign.consent.finalTitle": "Não dá para desfazer",
  "sign.consent.finalBody":
    "Uma assinatura confirmada não pode ser removida. Se algum dado estiver errado, rejeite a solicitação em vez de assinar.",
  "sign.consent.walletTitle": "Sua carteira é sua identidade",
  "sign.consent.walletBody":
    "Assine apenas em um dispositivo que seja seu. Quem tem acesso à carteira consegue assinar no seu lugar.",
  "sign.consent.agree": "Li e entendi o que minha assinatura significa.",
  "sign.consent.continue": "Continuar",
  "sign.consent.cancel": "Cancelar",

  "sign.done.title": "{count} certificado assinado",
  "sign.done.titleMany": "{count} certificados assinados",
  "sign.done.body":
    "As assinaturas já estão registradas na blockchain. Cada aluno pode resgatar o certificado assim que todas as assinaturas da edição estiverem completas.",
  "sign.done.partialTitle": "{signed} assinados · {failed} não concluídos",
  "sign.done.partialBody":
    "O que falhou continua na fila abaixo, ainda esperando por você. Selecione essas linhas e tente de novo.",
  "sign.done.noneTitle": "Nenhuma assinatura concluída",
  "sign.done.noneBody":
    "Nada foi registrado na blockchain. Os certificados continuam na fila abaixo.",
  "sign.done.perEdition": "{count} em {edition}",
  "sign.done.openEdition": "Abrir {edition}",
  "sign.done.dismiss": "Fechar",
};

export type signKey = keyof typeof pt;

export const signDict: Record<Locale, Record<signKey, string>> = {
  "pt-BR": pt,
  en: {
    "sign.consent.title": "Before you sign",
    "sign.consent.lead":
      "Your signature identifies you as a signer of these certificates. Read what it means — this notice appears once per session.",
    "sign.consent.attestTitle": "What you are attesting",
    "sign.consent.attestBody":
      "That you checked the name of every selected student and that they completed what the certificate states.",
    "sign.consent.recordTitle": "A public, permanent record",
    "sign.consent.recordBody":
      "Every signature is written to the Solana blockchain along with your wallet. Anyone can look the record up, and it cannot be erased.",
    "sign.consent.finalTitle": "It cannot be undone",
    "sign.consent.finalBody":
      "A confirmed signature cannot be removed. If anything is wrong, reject the request instead of signing it.",
    "sign.consent.walletTitle": "Your wallet is your identity",
    "sign.consent.walletBody":
      "Only sign on a device that is yours. Anyone with access to the wallet can sign in your place.",
    "sign.consent.agree": "I have read and understood what my signature means.",
    "sign.consent.continue": "Continue",
    "sign.consent.cancel": "Cancel",

    "sign.done.title": "{count} certificate signed",
    "sign.done.titleMany": "{count} certificates signed",
    "sign.done.body":
      "The signatures are on the blockchain. Each student can claim their certificate as soon as the edition's signatures are all in.",
    "sign.done.partialTitle": "{signed} signed · {failed} not completed",
    "sign.done.partialBody":
      "Whatever failed is still in the queue below, still waiting on you. Select those rows and try again.",
    "sign.done.noneTitle": "No signature completed",
    "sign.done.noneBody":
      "Nothing was written to the blockchain. The certificates are still in the queue below.",
    "sign.done.perEdition": "{count} in {edition}",
    "sign.done.openEdition": "Open {edition}",
    "sign.done.dismiss": "Dismiss",
  },
  es: {
    "sign.consent.title": "Antes de firmar",
    "sign.consent.lead":
      "Tu firma te identifica como firmante de estos certificados. Lee lo que significa — este aviso aparece una vez por sesión.",
    "sign.consent.attestTitle": "Qué estás declarando",
    "sign.consent.attestBody":
      "Que revisaste el nombre de cada alumno seleccionado y que completaron lo que el certificado afirma.",
    "sign.consent.recordTitle": "Registro público y permanente",
    "sign.consent.recordBody":
      "Cada firma se graba en la blockchain de Solana junto con tu billetera. Cualquiera puede consultar el registro, y no se puede borrar.",
    "sign.consent.finalTitle": "No se puede deshacer",
    "sign.consent.finalBody":
      "Una firma confirmada no se puede quitar. Si algún dato está mal, rechaza la solicitud en lugar de firmarla.",
    "sign.consent.walletTitle": "Tu billetera es tu identidad",
    "sign.consent.walletBody":
      "Firma solo en un dispositivo que sea tuyo. Quien tenga acceso a la billetera puede firmar en tu lugar.",
    "sign.consent.agree": "Leí y entendí lo que significa mi firma.",
    "sign.consent.continue": "Continuar",
    "sign.consent.cancel": "Cancelar",

    "sign.done.title": "{count} certificado firmado",
    "sign.done.titleMany": "{count} certificados firmados",
    "sign.done.body":
      "Las firmas ya están en la blockchain. Cada alumno puede reclamar su certificado apenas se completen todas las firmas de la edición.",
    "sign.done.partialTitle": "{signed} firmados · {failed} sin completar",
    "sign.done.partialBody":
      "Lo que falló sigue en la fila de abajo, todavía esperándote. Selecciona esas filas e inténtalo de nuevo.",
    "sign.done.noneTitle": "Ninguna firma completada",
    "sign.done.noneBody":
      "No se escribió nada en la blockchain. Los certificados siguen en la fila de abajo.",
    "sign.done.perEdition": "{count} en {edition}",
    "sign.done.openEdition": "Abrir {edition}",
    "sign.done.dismiss": "Cerrar",
  },
};
