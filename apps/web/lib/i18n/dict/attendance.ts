import type { Locale } from "../locales";

/**
 * Attendance-NFT surfaces (claim page, creator dashboard). Task 12 seeded
 * only the keys its hooks call directly; Task 13 extends this file with the
 * rest of the claim-page and dashboard copy.
 */
const pt = {
  "attendance.nav": "Eventos",
  "attendance.walletNoAccount": "A carteira não retornou nenhuma conta.",
  "attendance.walletNotConnected": "Conecte uma carteira para continuar.",
  "attendance.signatureCancelled": "Assinatura cancelada.",
  "attendance.picker.title": "Conectar carteira",
  "attendance.picker.empty": "Nenhuma carteira detectada neste navegador.",
  "attendance.picker.fallback": "Sem carteira? Continue com e-mail",
  "attendance.picker.connected": "Conectado como {address}",
  "attendance.picker.change": "Trocar carteira",
  "attendance.claim.title": "NFT de presença",
  "attendance.claim.claimed": "{count} reivindicados",
  "attendance.claim.claimedOf": "{count} de {max} reivindicados",
  "attendance.claim.mint": "Emitir NFT de presença",
  "attendance.claim.confirming": "Confirmando na rede…",
  "attendance.claim.success": "NFT de presença emitido!",
  "attendance.claim.successBody":
    "Confira na sua carteira — pode levar alguns segundos para aparecer.",
  "attendance.claim.viewTx": "Ver transação",
  "attendance.claim.already": "Você já reivindicou este NFT.",
  "attendance.claim.invalid.title": "Link inválido",
  "attendance.claim.invalid.body":
    "Este link de presença não é válido ou foi substituído pelo organizador.",
  "attendance.claim.paused.title": "Reivindicações pausadas",
  "attendance.claim.paused.body":
    "O organizador pausou as reivindicações deste evento.",
  "attendance.claim.ended.title": "Período encerrado",
  "attendance.claim.ended.body":
    "O período de reivindicação deste evento terminou.",
  "attendance.claim.exhausted.title": "Vagas esgotadas",
  "attendance.claim.exhausted.body":
    "Todas as vagas deste evento já foram reivindicadas.",
  "attendance.claim.free": "Gratuito — as taxas de rede são por nossa conta.",
  "attendance.events.title": "Eventos",
  "attendance.events.subtitle":
    "Crie eventos e distribua NFTs de presença por link secreto.",
  "attendance.events.new": "Novo evento",
  "attendance.events.empty": "Nenhum evento ainda. Crie o primeiro!",
  "attendance.events.copyLink": "Copiar link",
  "attendance.events.copied": "Link copiado!",
  "attendance.events.qr": "QR code",
  "attendance.events.pause": "Pausar",
  "attendance.events.resume": "Retomar",
  "attendance.events.rotate": "Gerar novo link",
  "attendance.events.rotateConfirmTitle": "Gerar novo link?",
  "attendance.events.rotateConfirmBody":
    "O link atual deixará de funcionar imediatamente.",
  "attendance.events.paused": "Pausado",
  "attendance.events.open": "Aberto",
  "attendance.signin.title": "Área do organizador",
  "attendance.signin.body":
    "Conecte uma carteira autorizada e assine para entrar.",
  "attendance.signin.cta": "Entrar com carteira",
  "attendance.signin.denied":
    "Esta carteira não está autorizada a criar eventos.",
  "attendance.form.name": "Nome do evento",
  "attendance.form.description": "Descrição",
  "attendance.form.date": "Data do evento",
  "attendance.form.image": "Imagem (PNG, JPEG ou WebP, até 2MB)",
  "attendance.form.maxSupply": "Limite de participantes (opcional)",
  "attendance.form.deadline": "Prazo de reivindicação (opcional)",
  "attendance.form.submit": "Criar evento",
  "attendance.form.creating": "Criando evento…",
  "attendance.form.created": "Evento criado! Compartilhe o link secreto.",
} as const;

export type attendanceKey = keyof typeof pt;

export const attendanceDict: Record<Locale, Record<attendanceKey, string>> = {
  "pt-BR": pt,
  en: {
    "attendance.nav": "Events",
    "attendance.walletNoAccount": "The wallet returned no accounts.",
    "attendance.walletNotConnected": "Connect a wallet to continue.",
    "attendance.signatureCancelled": "Signature cancelled.",
    "attendance.picker.title": "Connect wallet",
    "attendance.picker.empty": "No wallets detected in this browser.",
    "attendance.picker.fallback": "No wallet? Continue with email",
    "attendance.picker.connected": "Connected as {address}",
    "attendance.picker.change": "Change wallet",
    "attendance.claim.title": "Attendance NFT",
    "attendance.claim.claimed": "{count} claimed",
    "attendance.claim.claimedOf": "{count} of {max} claimed",
    "attendance.claim.mint": "Mint attendance NFT",
    "attendance.claim.confirming": "Confirming on-chain…",
    "attendance.claim.success": "Attendance NFT minted!",
    "attendance.claim.successBody":
      "Check your wallet — it may take a few seconds to appear.",
    "attendance.claim.viewTx": "View transaction",
    "attendance.claim.already": "You already claimed this NFT.",
    "attendance.claim.invalid.title": "Invalid link",
    "attendance.claim.invalid.body":
      "This attendance link is not valid or was replaced by the organizer.",
    "attendance.claim.paused.title": "Claims paused",
    "attendance.claim.paused.body":
      "The organizer paused claims for this event.",
    "attendance.claim.ended.title": "Claim period over",
    "attendance.claim.ended.body": "The claim period for this event has ended.",
    "attendance.claim.exhausted.title": "Fully claimed",
    "attendance.claim.exhausted.body":
      "All spots for this event have been claimed.",
    "attendance.claim.free": "Free — network fees are on us.",
    "attendance.events.title": "Events",
    "attendance.events.subtitle":
      "Create events and hand out attendance NFTs via a secret link.",
    "attendance.events.new": "New event",
    "attendance.events.empty": "No events yet. Create the first one!",
    "attendance.events.copyLink": "Copy link",
    "attendance.events.copied": "Link copied!",
    "attendance.events.qr": "QR code",
    "attendance.events.pause": "Pause",
    "attendance.events.resume": "Resume",
    "attendance.events.rotate": "Rotate link",
    "attendance.events.rotateConfirmTitle": "Rotate link?",
    "attendance.events.rotateConfirmBody":
      "The current link stops working immediately.",
    "attendance.events.paused": "Paused",
    "attendance.events.open": "Open",
    "attendance.signin.title": "Organizer area",
    "attendance.signin.body": "Connect an authorized wallet and sign in.",
    "attendance.signin.cta": "Sign in with wallet",
    "attendance.signin.denied":
      "This wallet is not authorized to create events.",
    "attendance.form.name": "Event name",
    "attendance.form.description": "Description",
    "attendance.form.date": "Event date",
    "attendance.form.image": "Image (PNG, JPEG or WebP, up to 2MB)",
    "attendance.form.maxSupply": "Attendee cap (optional)",
    "attendance.form.deadline": "Claim deadline (optional)",
    "attendance.form.submit": "Create event",
    "attendance.form.creating": "Creating event…",
    "attendance.form.created": "Event created! Share the secret link.",
  },
  es: {
    "attendance.nav": "Eventos",
    "attendance.walletNoAccount": "La billetera no devolvió ninguna cuenta.",
    "attendance.walletNotConnected": "Conecta una billetera para continuar.",
    "attendance.signatureCancelled": "Firma cancelada.",
    "attendance.picker.title": "Conectar billetera",
    "attendance.picker.empty": "No se detectaron billeteras en este navegador.",
    "attendance.picker.fallback": "¿Sin billetera? Continúa con e-mail",
    "attendance.picker.connected": "Conectado como {address}",
    "attendance.picker.change": "Cambiar billetera",
    "attendance.claim.title": "NFT de asistencia",
    "attendance.claim.claimed": "{count} reclamados",
    "attendance.claim.claimedOf": "{count} de {max} reclamados",
    "attendance.claim.mint": "Emitir NFT de asistencia",
    "attendance.claim.confirming": "Confirmando en la red…",
    "attendance.claim.success": "¡NFT de asistencia emitido!",
    "attendance.claim.successBody":
      "Revisa tu billetera — puede tardar unos segundos en aparecer.",
    "attendance.claim.viewTx": "Ver transacción",
    "attendance.claim.already": "Ya reclamaste este NFT.",
    "attendance.claim.invalid.title": "Enlace inválido",
    "attendance.claim.invalid.body":
      "Este enlace de asistencia no es válido o fue reemplazado por el organizador.",
    "attendance.claim.paused.title": "Reclamos en pausa",
    "attendance.claim.paused.body":
      "El organizador pausó los reclamos de este evento.",
    "attendance.claim.ended.title": "Período finalizado",
    "attendance.claim.ended.body":
      "El período de reclamo de este evento terminó.",
    "attendance.claim.exhausted.title": "Cupos agotados",
    "attendance.claim.exhausted.body":
      "Todos los cupos de este evento ya fueron reclamados.",
    "attendance.claim.free":
      "Gratis — las tarifas de red corren por nuestra cuenta.",
    "attendance.events.title": "Eventos",
    "attendance.events.subtitle":
      "Crea eventos y distribuye NFTs de asistencia por enlace secreto.",
    "attendance.events.new": "Nuevo evento",
    "attendance.events.empty": "Aún no hay eventos. ¡Crea el primero!",
    "attendance.events.copyLink": "Copiar enlace",
    "attendance.events.copied": "¡Enlace copiado!",
    "attendance.events.qr": "Código QR",
    "attendance.events.pause": "Pausar",
    "attendance.events.resume": "Reanudar",
    "attendance.events.rotate": "Generar nuevo enlace",
    "attendance.events.rotateConfirmTitle": "¿Generar nuevo enlace?",
    "attendance.events.rotateConfirmBody":
      "El enlace actual dejará de funcionar de inmediato.",
    "attendance.events.paused": "Pausado",
    "attendance.events.open": "Abierto",
    "attendance.signin.title": "Área del organizador",
    "attendance.signin.body":
      "Conecta una billetera autorizada y firma para entrar.",
    "attendance.signin.cta": "Entrar con billetera",
    "attendance.signin.denied":
      "Esta billetera no está autorizada a crear eventos.",
    "attendance.form.name": "Nombre del evento",
    "attendance.form.description": "Descripción",
    "attendance.form.date": "Fecha del evento",
    "attendance.form.image": "Imagen (PNG, JPEG o WebP, hasta 2MB)",
    "attendance.form.maxSupply": "Límite de participantes (opcional)",
    "attendance.form.deadline": "Plazo de reclamo (opcional)",
    "attendance.form.submit": "Crear evento",
    "attendance.form.creating": "Creando evento…",
    "attendance.form.created": "¡Evento creado! Comparte el enlace secreto.",
  },
};
