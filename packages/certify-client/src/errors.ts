/**
 * Program error codes (`ProgramError::Custom(n)`) mirrored from the Rust
 * `CertifyError` enum, in ABI order. The numeric codes are a stable contract —
 * never renumber. The app maps these to human (pt-BR) messages.
 */

export type ProgramErrorName =
  | "NotAnAdmin"
  | "NotASigner"
  | "InvalidNotary"
  | "InvalidCertStatus"
  | "EditionNotOpen"
  | "SupplyExhausted"
  | "DuplicateSigner"
  | "InvalidSignerCount"
  | "InvalidCommitment"
  | "AdminListFull"
  | "AdminAlreadyExists"
  | "AdminNotFound"
  | "BelowMinAdmins"
  | "AssetAlreadyRecorded"
  | "InvalidHash"
  | "Overflow"
  | "WrongEdition"
  | "InvalidStatusValue"
  | "AccountAlreadyInitialized"
  | "WrongStudent";

export const CERTIFY_ERROR_MAP: Record<number, ProgramErrorName> = {
  0: "NotAnAdmin",
  1: "NotASigner",
  2: "InvalidNotary",
  3: "InvalidCertStatus",
  4: "EditionNotOpen",
  5: "SupplyExhausted",
  6: "DuplicateSigner",
  7: "InvalidSignerCount",
  8: "InvalidCommitment",
  9: "AdminListFull",
  10: "AdminAlreadyExists",
  11: "AdminNotFound",
  12: "BelowMinAdmins",
  13: "AssetAlreadyRecorded",
  14: "InvalidHash",
  15: "Overflow",
  16: "WrongEdition",
  17: "InvalidStatusValue",
  18: "AccountAlreadyInitialized",
  19: "WrongStudent",
};

/** Resolve a `Custom(n)` code to its name, or `undefined` if it isn't a Certify code. */
export function getCertifyErrorName(
  code: number,
): ProgramErrorName | undefined {
  return CERTIFY_ERROR_MAP[code];
}

/**
 * Thrown by decoders on a malformed account buffer (wrong size, wrong
 * discriminator, or an out-of-range status byte). Never let a raw codec range
 * error escape — callers get this typed shape instead (skill rule 8).
 */
export class CodecError extends Error {
  readonly kind: "WrongSize" | "WrongDiscriminator" | "InvalidStatus";
  constructor(kind: CodecError["kind"], message: string) {
    super(message);
    this.name = "CodecError";
    this.kind = kind;
  }
}
