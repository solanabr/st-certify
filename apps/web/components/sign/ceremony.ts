// The signing ceremony's two decisions — which gate a sign press opens, and
// what a finished batch actually accomplished — kept out of the .tsx so they
// are unit-testable (vitest runs in a node env), same split as
// components/me/ceremony-machine.ts.

import type { CertSignState } from "@/hooks/useMassSign";

export type SignStep = "consent" | "confirm";

/**
 * The consent disclosure (spec §6.4) gates the FIRST wallet prompt of a
 * session, not every batch: it explains what a signature attests and that the
 * record is permanent, which is a thing to read once, and re-prompting it
 * before each batch would train signers to click through it.
 */
export function nextSignStep(consented: boolean): SignStep {
  return consented ? "confirm" : "consent";
}

export interface BatchEditionSummary {
  editionAddress: string;
  editionName: string;
  signed: number;
  failed: number;
}

export interface BatchSummary {
  signed: number;
  failed: number;
  editions: BatchEditionSummary[];
}

export interface BatchGroupInput {
  editionAddress: string;
  editionName: string;
  certificateAddresses: readonly string[];
}

/**
 * What the completion state reports, derived from the run's final per-cert
 * states rather than a counter incremented along the way — the same reason the
 * progress bar counts confirmed chunks instead of optimistic ones.
 *
 * Only `confirmed` counts as signed. A cert left `idle` or `signing` when the
 * run ended (a cancelled wallet popup, a submit that threw) is a failure from
 * the signer's point of view: it is still waiting for them.
 */
export function summarizeBatch(
  groups: readonly BatchGroupInput[],
  certState: Record<string, CertSignState>,
): BatchSummary {
  const editions = groups.map((group) => {
    const signed = group.certificateAddresses.filter(
      (address) => certState[address] === "confirmed",
    ).length;
    return {
      editionAddress: group.editionAddress,
      editionName: group.editionName,
      signed,
      failed: group.certificateAddresses.length - signed,
    };
  });

  return {
    signed: editions.reduce((n, e) => n + e.signed, 0),
    failed: editions.reduce((n, e) => n + e.failed, 0),
    editions,
  };
}
