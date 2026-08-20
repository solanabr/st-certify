export interface GateInput {
  claim_open: boolean;
  claim_deadline: string | null;
}

export type ClaimGate =
  { ok: true } | { ok: false; code: "ATTENDANCE_CLOSED"; message: string };

/** Pure gating decisions; supply + one-per-wallet are enforced atomically in SQL. */
export function checkClaimGate(
  event: GateInput,
  now: Date = new Date(),
): ClaimGate {
  if (!event.claim_open) {
    return {
      ok: false,
      code: "ATTENDANCE_CLOSED",
      message: "As reivindicações deste evento estão pausadas.",
    };
  }
  if (event.claim_deadline !== null) {
    const deadlineMs = Date.parse(event.claim_deadline);
    // An unparseable deadline fails CLOSED — never mint against a corrupt event.
    if (Number.isNaN(deadlineMs) || now.getTime() > deadlineMs) {
      return {
        ok: false,
        code: "ATTENDANCE_CLOSED",
        message: "O período de reivindicação deste evento terminou.",
      };
    }
  }
  return { ok: true };
}
