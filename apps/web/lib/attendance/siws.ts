// SIWS-style ownership-proof message. Pure: no I/O, unit-tested. The server
// builds this exact text (auth/nonce route), the wallet signs it, and the
// server re-parses + verifies on submit. pt-BR on purpose — it is shown
// verbatim inside wallet signing prompts to Brazilian users.
export type SiwsPurpose = "attendance-claim" | "attendance-creator";

export interface SiwsFields {
  domain: string;
  wallet: string;
  purpose: SiwsPurpose;
  nonce: string;
  issuedAt: string;
}

export const SIWS_MAX_AGE_MS = 300_000;

const PURPOSES: readonly SiwsPurpose[] = [
  "attendance-claim",
  "attendance-creator",
];

export function buildSiwsMessage(f: SiwsFields): string {
  return [
    `${f.domain} quer confirmar a posse da sua carteira.`,
    "",
    `Carteira: ${f.wallet}`,
    `Proposito: ${f.purpose}`,
    `Nonce: ${f.nonce}`,
    `Emitido em: ${f.issuedAt}`,
  ].join("\n");
}

export function parseSiwsMessage(message: string): SiwsFields | null {
  const lines = message.split("\n");
  if (lines.length !== 6) return null;
  const domain = lines[0]?.match(
    /^(.+) quer confirmar a posse da sua carteira\.$/,
  )?.[1];
  const wallet = lines[2]?.match(/^Carteira: (.+)$/)?.[1];
  const purpose = lines[3]?.match(/^Proposito: (.+)$/)?.[1];
  const nonce = lines[4]?.match(/^Nonce: (.+)$/)?.[1];
  const issuedAt = lines[5]?.match(/^Emitido em: (.+)$/)?.[1];
  if (!domain || !wallet || !purpose || !nonce || !issuedAt) return null;
  if (!PURPOSES.includes(purpose as SiwsPurpose)) return null;
  return { domain, wallet, purpose: purpose as SiwsPurpose, nonce, issuedAt };
}

export function isSiwsFresh(issuedAt: string, now: Date = new Date()): boolean {
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age <= SIWS_MAX_AGE_MS;
}
