import type { Locale } from "../locales";

/** Certificator dashboard: pending inbox, mass-sign flow, reject dialog. */
const pt = {
  "certificator.awaitingYou": "{count} aguardando você",
  "certificator.subtitle":
    "Confira o nome de cada aluno antes de assinar — sua assinatura fica registrada permanentemente na blockchain.",
  "certificator.signingProgress":
    "Assinando… transação {done}/{total} confirmada",
  "certificator.loadError": "Falha ao carregar a fila de assinaturas",
  "certificator.loadErrorHint": "Tente novamente em instantes.",
  "certificator.retry": "Tentar novamente",
  "certificator.emptyTitle": "Nenhum certificado aguardando sua assinatura.",
  "certificator.emptyHint": "Novas solicitações aparecem aqui automaticamente.",
  "certificator.refresh": "Atualizar",
  "certificator.selectionSummaryOne": "selecionado · {txs}",
  "certificator.selectionSummaryMany": "selecionados · {txs}",
  "certificator.txCountOne": "{count} transação",
  "certificator.txCountMany": "{count} transações",
  "certificator.clear": "Limpar",
  "certificator.signing": "Assinando…",
  "certificator.signCountOne": "Assinar {count} certificado",
  "certificator.signCountMany": "Assinar {count} certificados",
  "certificator.confirmTitleOne": "Assinar {count} certificado?",
  "certificator.confirmTitleMany": "Assinar {count} certificados?",
  "certificator.confirmBodyOne":
    "Sua assinatura vale para {count} aluno em {txs} — {approvals}. Confira os nomes:",
  "certificator.confirmBodyMany":
    "Sua assinatura vale para {count} alunos em {txs} — {approvals}. Confira os nomes:",
  "certificator.approvalsOne": "uma única aprovação na carteira",
  "certificator.approvalsMany":
    "{count} aprovações na carteira (uma por carteira usada)",
  "certificator.andMore": "e mais {count}…",
  "certificator.cancel": "Cancelar",
  "certificator.sign": "Assinar",
  "certificator.rejectSuccess":
    "Solicitação rejeitada e aluguel devolvido ao estudante.",
  "certificator.signed": "Assinado",
  "certificator.failed": "Falhou",
  "certificator.selectAllIn": "Selecionar todos de {edition}",
  "certificator.pendingCountOne": "{count} pendente",
  "certificator.pendingCountMany": "{count} pendentes",
  "certificator.colStudent": "Aluno",
  "certificator.colRequested": "Solicitado",
  "certificator.colSignatures": "Assinaturas",
  "certificator.selectCertOf": "Selecionar certificado de {name}",
  "certificator.actionsFor": "Ações para {name}",
  "certificator.rejectEllipsis": "Rejeitar…",
  "certificator.rejectTitle": "Rejeitar certificado de {name}",
  "certificator.rejectDescription":
    "A solicitação será encerrada e o valor do aluguel devolvido automaticamente ao estudante. O motivo fica registrado no histórico (não vai para a blockchain). O estudante pode solicitar novamente.",
  "certificator.reasonLabel": "Motivo (opcional)",
  "certificator.reasonPlaceholder": "Ex.: nome não confere com o documento.",
  "certificator.rejecting": "Rejeitando…",
  "certificator.reject": "Rejeitar",
  "certificator.walletNotFound":
    "Carteira não encontrada. Reconecte e tente novamente.",
  "certificator.walletNoSigning":
    "Esta carteira não suporta assinatura de transações.",
  "certificator.signatureCancelled": "Assinatura cancelada.",
  "certificator.signedToast": "{count} assinados",
  "certificator.partialToast": "{signed} assinados · {failed} falharam",
  "certificator.partialToastHint":
    "Selecione as linhas com erro e tente novamente.",
} as const;

export type certificatorKey = keyof typeof pt;

export const certificatorDict: Record<
  Locale,
  Record<certificatorKey, string>
> = {
  "pt-BR": pt,
  en: {
    "certificator.awaitingYou": "{count} waiting for you",
    "certificator.subtitle":
      "Check each student's name before signing — your signature is recorded permanently on the blockchain.",
    "certificator.signingProgress":
      "Signing… transaction {done}/{total} confirmed",
    "certificator.loadError": "Couldn't load the signing queue",
    "certificator.loadErrorHint": "Try again in a moment.",
    "certificator.retry": "Try again",
    "certificator.emptyTitle":
      "No certificates are waiting for your signature.",
    "certificator.emptyHint": "New requests show up here automatically.",
    "certificator.refresh": "Refresh",
    "certificator.selectionSummaryOne": "selected · {txs}",
    "certificator.selectionSummaryMany": "selected · {txs}",
    "certificator.txCountOne": "{count} transaction",
    "certificator.txCountMany": "{count} transactions",
    "certificator.clear": "Clear",
    "certificator.signing": "Signing…",
    "certificator.signCountOne": "Sign {count} certificate",
    "certificator.signCountMany": "Sign {count} certificates",
    "certificator.confirmTitleOne": "Sign {count} certificate?",
    "certificator.confirmTitleMany": "Sign {count} certificates?",
    "certificator.confirmBodyOne":
      "Your signature covers {count} student across {txs} — {approvals}. Check the names:",
    "certificator.confirmBodyMany":
      "Your signature covers {count} students across {txs} — {approvals}. Check the names:",
    "certificator.approvalsOne": "a single wallet approval",
    "certificator.approvalsMany":
      "{count} wallet approvals (one per wallet used)",
    "certificator.andMore": "and {count} more…",
    "certificator.cancel": "Cancel",
    "certificator.sign": "Sign",
    "certificator.rejectSuccess":
      "Request rejected and the rent refunded to the student.",
    "certificator.signed": "Signed",
    "certificator.failed": "Failed",
    "certificator.selectAllIn": "Select all in {edition}",
    "certificator.pendingCountOne": "{count} pending",
    "certificator.pendingCountMany": "{count} pending",
    "certificator.colStudent": "Student",
    "certificator.colRequested": "Requested",
    "certificator.colSignatures": "Signatures",
    "certificator.selectCertOf": "Select the certificate for {name}",
    "certificator.actionsFor": "Actions for {name}",
    "certificator.rejectEllipsis": "Reject…",
    "certificator.rejectTitle": "Reject the certificate for {name}",
    "certificator.rejectDescription":
      "The request will be closed and the rent automatically refunded to the student. The reason is kept in the history (it does not go to the blockchain). The student can request again.",
    "certificator.reasonLabel": "Reason (optional)",
    "certificator.reasonPlaceholder":
      "E.g.: the name doesn't match the ID document.",
    "certificator.rejecting": "Rejecting…",
    "certificator.reject": "Reject",
    "certificator.walletNotFound":
      "Wallet not found. Reconnect it and try again.",
    "certificator.walletNoSigning":
      "This wallet doesn't support transaction signing.",
    "certificator.signatureCancelled": "Signature cancelled.",
    "certificator.signedToast": "{count} signed",
    "certificator.partialToast": "{signed} signed · {failed} failed",
    "certificator.partialToastHint":
      "Select the rows that failed and try again.",
  },
  es: {
    "certificator.awaitingYou": "{count} esperando por ti",
    "certificator.subtitle":
      "Revisa el nombre de cada alumno antes de firmar — tu firma queda registrada permanentemente en la blockchain.",
    "certificator.signingProgress":
      "Firmando… transacción {done}/{total} confirmada",
    "certificator.loadError": "No se pudo cargar la cola de firmas",
    "certificator.loadErrorHint": "Inténtalo de nuevo en unos instantes.",
    "certificator.retry": "Reintentar",
    "certificator.emptyTitle": "Ningún certificado espera tu firma.",
    "certificator.emptyHint":
      "Las nuevas solicitudes aparecen aquí automáticamente.",
    "certificator.refresh": "Actualizar",
    "certificator.selectionSummaryOne": "seleccionado · {txs}",
    "certificator.selectionSummaryMany": "seleccionados · {txs}",
    "certificator.txCountOne": "{count} transacción",
    "certificator.txCountMany": "{count} transacciones",
    "certificator.clear": "Limpiar",
    "certificator.signing": "Firmando…",
    "certificator.signCountOne": "Firmar {count} certificado",
    "certificator.signCountMany": "Firmar {count} certificados",
    "certificator.confirmTitleOne": "¿Firmar {count} certificado?",
    "certificator.confirmTitleMany": "¿Firmar {count} certificados?",
    "certificator.confirmBodyOne":
      "Tu firma vale para {count} alumno en {txs} — {approvals}. Revisa los nombres:",
    "certificator.confirmBodyMany":
      "Tu firma vale para {count} alumnos en {txs} — {approvals}. Revisa los nombres:",
    "certificator.approvalsOne": "una única aprobación en la billetera",
    "certificator.approvalsMany":
      "{count} aprobaciones en la billetera (una por billetera usada)",
    "certificator.andMore": "y {count} más…",
    "certificator.cancel": "Cancelar",
    "certificator.sign": "Firmar",
    "certificator.rejectSuccess":
      "Solicitud rechazada y el alquiler devuelto al estudiante.",
    "certificator.signed": "Firmado",
    "certificator.failed": "Falló",
    "certificator.selectAllIn": "Seleccionar todos de {edition}",
    "certificator.pendingCountOne": "{count} pendiente",
    "certificator.pendingCountMany": "{count} pendientes",
    "certificator.colStudent": "Alumno",
    "certificator.colRequested": "Solicitado",
    "certificator.colSignatures": "Firmas",
    "certificator.selectCertOf": "Seleccionar el certificado de {name}",
    "certificator.actionsFor": "Acciones para {name}",
    "certificator.rejectEllipsis": "Rechazar…",
    "certificator.rejectTitle": "Rechazar el certificado de {name}",
    "certificator.rejectDescription":
      "La solicitud se cerrará y el valor del alquiler se devolverá automáticamente al estudiante. El motivo queda registrado en el historial (no va a la blockchain). El estudiante puede solicitarlo de nuevo.",
    "certificator.reasonLabel": "Motivo (opcional)",
    "certificator.reasonPlaceholder":
      "Ej.: el nombre no coincide con el documento.",
    "certificator.rejecting": "Rechazando…",
    "certificator.reject": "Rechazar",
    "certificator.walletNotFound":
      "Billetera no encontrada. Vuelve a conectarla e inténtalo de nuevo.",
    "certificator.walletNoSigning":
      "Esta billetera no admite la firma de transacciones.",
    "certificator.signatureCancelled": "Firma cancelada.",
    "certificator.signedToast": "{count} firmados",
    "certificator.partialToast": "{signed} firmados · {failed} fallaron",
    "certificator.partialToastHint":
      "Selecciona las filas con error e inténtalo de nuevo.",
  },
};
