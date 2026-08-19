import type { Locale } from "../locales";

/**
 * Attendance-NFT surfaces (claim page, creator dashboard). Task 12 seeds
 * only the keys its hooks call directly; Task 13 extends this file with the
 * rest of the claim-page and dashboard copy.
 */
const pt = {
  "attendance.walletNoAccount": "A carteira não retornou nenhuma conta.",
  "attendance.walletNotConnected": "Conecte uma carteira para continuar.",
  "attendance.signatureCancelled": "Assinatura cancelada.",
  "attendance.claim.success": "NFT de presença emitido!",
} as const;

export type attendanceKey = keyof typeof pt;

export const attendanceDict: Record<Locale, Record<attendanceKey, string>> = {
  "pt-BR": pt,
  en: {
    "attendance.walletNoAccount": "The wallet returned no accounts.",
    "attendance.walletNotConnected": "Connect a wallet to continue.",
    "attendance.signatureCancelled": "Signature cancelled.",
    "attendance.claim.success": "Attendance NFT minted!",
  },
  es: {
    "attendance.walletNoAccount": "La billetera no devolvió ninguna cuenta.",
    "attendance.walletNotConnected": "Conecta una billetera para continuar.",
    "attendance.signatureCancelled": "Firma cancelada.",
    "attendance.claim.success": "¡NFT de asistencia emitido!",
  },
};
