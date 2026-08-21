import type { CertificateStatusValue } from "@/lib/db/types";

/**
 * The five states the management page's pipeline column shows, in order:
 * solicitado → assinaturas m/n → pronto → emitido, plus the two terminal
 * states that leave the pipeline.
 */
export type PipelineStage =
  "requested" | "signing" | "ready" | "issued" | "rejected" | "revoked";

export interface PipelineInput {
  status: CertificateStatusValue;
  /** Bit per signer position, same encoding `status-timeline` reads. */
  signerBitmap: number;
  /** Signers on the edition — the denominator, and the bit ceiling. */
  signerCount: number;
}

export interface PipelineState {
  stage: PipelineStage;
  signed: number;
  total: number;
}

const TERMINAL: Partial<Record<CertificateStatusValue, PipelineStage>> = {
  Revoked: "revoked",
  Rejected: "rejected",
  Claimed: "issued",
  FullySigned: "ready",
};

/**
 * Derives the pipeline cell from the mirror row alone — pure, so the table can
 * render it without a second query. Bits at or above `signerCount` are ignored:
 * the mirror can lag a signer roster change, and a "4/3 assinaturas" cell would
 * read as data corruption to the issuer.
 */
export function pipelineState(input: PipelineInput): PipelineState {
  const total = Math.max(0, input.signerCount);

  let signed = 0;
  for (let position = 0; position < total; position += 1) {
    if ((input.signerBitmap & (1 << position)) !== 0) {
      signed += 1;
    }
  }

  const terminal = TERMINAL[input.status];
  if (terminal) {
    return { stage: terminal, signed, total };
  }

  return { stage: signed > 0 ? "signing" : "requested", signed, total };
}
