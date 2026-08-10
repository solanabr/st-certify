/**
 * Program-level constants for the Certify Pinocchio program: id, discriminators,
 * exact account sizes, instruction data lengths, byte offsets (for `getProgramAccounts`
 * memcmp filters), CU budgets, and the status enumerations.
 *
 * These mirror the on-chain byte layout (pinocchio appendix §2/§3). They are the
 * single source of truth the codecs and PDA helpers derive from; `codecs.test.ts`
 * asserts each account codec's fixedSize equals the size declared here.
 */

import { address, type Address } from "@solana/kit";

/** Deployed program id (matches `programs/certify/certify-keypair.json`). */
export const PROGRAM_ID: Address = address(
  "5Wx1mNKSgtu1pnwHgLe5duYK9xcFhEhsd1zoeJi9EiUZ",
);

/** System Program — CPI target + the all-zero pubkey's base58 form. */
export const SYSTEM_PROGRAM_ID: Address = address(
  "11111111111111111111111111111111",
);

/**
 * The all-zero pubkey (identical 32 zero bytes to the System Program id). Used
 * as the "unset" sentinel (e.g. a certificate's `asset` before mint) and to
 * zero-pad fixed admin/signer slots when encoding instructions.
 */
export const ZERO_ADDRESS: Address = SYSTEM_PROGRAM_ID;

/** Account discriminator (byte 0 of every program-owned account). */
export const AccountDisc = {
  Uninitialized: 0,
  Config: 1,
  Edition: 2,
  Certificate: 3,
  HashIndex: 4,
  Tombstone: 255,
} as const;

/** Instruction discriminator (byte 0 of instruction data). */
export const IxDisc = {
  InitConfig: 0,
  AddAdmin: 1,
  RemoveAdmin: 2,
  SetNotary: 3,
  CreateEdition: 4,
  SetEditionStatus: 5,
  SetMaxSupply: 6,
  RequestCertificate: 7,
  SignCertificate: 8,
  RejectRequest: 9,
  ClaimCertificate: 10,
  RecordAsset: 11,
  RevokeCertificate: 12,
} as const;

/** Exact serialized account sizes, in bytes. */
export const ACCOUNT_SIZES = {
  config: 299,
  edition: 676,
  certificate: 228,
  hashIndex: 34,
} as const;

/**
 * Exact instruction data lengths, INCLUDING the leading 1-byte discriminator
 * (the "TOTAL" convention — the program asserts `data.len() == N` before parsing).
 */
export const IX_DATA_LEN = {
  initConfig: 290,
  addAdmin: 33,
  removeAdmin: 33,
  setNotary: 33,
  createEdition: 634,
  setEditionStatus: 2,
  setMaxSupply: 9,
  requestCertificate: 33,
  signCertificate: 1,
  rejectRequest: 1,
  claimCertificate: 33,
  recordAsset: 33,
  revokeCertificate: 1,
} as const;

/**
 * Field byte offsets for `getProgramAccounts` memcmp filters (decoding itself goes
 * through the codecs). Certificates are queryable by edition (@4), student (@36),
 * or status (@2); every account carries its discriminator @0.
 */
export const OFFSETS = {
  config: {
    disc: 0,
    bump: 1,
    adminCount: 2,
    notary: 3,
    admins: 35,
    editionsCreated: 291,
  },
  edition: {
    disc: 0,
    bump: 1,
    status: 2,
    signerCount: 3,
    id: 4,
    name: 12,
    specHash: 76,
    signers: 108,
    maxSupply: 636,
    certsRequested: 644,
    certsClosed: 652,
    certsClaimed: 660,
    createdAt: 668,
  },
  certificate: {
    disc: 0,
    bump: 1,
    status: 2,
    signedMask: 3,
    edition: 4,
    student: 36,
    nameCommitment: 68,
    artifactHash: 100,
    asset: 132,
    certNumber: 164,
    sigTimestamps: 172,
    claimedAt: 220,
  },
  hashIndex: { disc: 0, bump: 1, certificate: 2 },
} as const;

/** Edition signer-slot geometry: 6 slots of 88 bytes (pubkey32, name32, role24). */
export const EDITION_SIGNER_SLOT_SIZE = 88;
export const EDITION_MAX_SIGNERS = 6;
export const EDITION_NAME_LEN = 64;
export const SIGNER_NAME_LEN = 32;
export const SIGNER_ROLE_LEN = 24;
export const CONFIG_MAX_ADMINS = 8;

/**
 * Per-instruction CU ceilings (compute-unit budgets), for `setComputeUnitLimit`
 * guidance. The 20-ix sign batch budget is `20 * 5_000 + 10_000 = 110_000`.
 */
export const CU_BUDGETS = {
  initConfig: 10_000,
  addAdmin: 5_000,
  removeAdmin: 5_000,
  setNotary: 5_000,
  createEdition: 12_000,
  setEditionStatus: 5_000,
  setMaxSupply: 5_000,
  requestCertificate: 12_000,
  signCertificate: 5_000,
  rejectRequest: 8_000,
  claimCertificate: 15_000,
  recordAsset: 5_000,
  revokeCertificate: 5_000,
  /** Client limit for a 20-ix sign batch. */
  signBatch20: 110_000,
} as const;

/** Edition lifecycle status. */
export const EditionStatus = { Paused: 1, Open: 2, Closed: 3 } as const;
export type EditionStatusName = keyof typeof EditionStatus;

/** Certificate lifecycle status. `PartiallySigned` is derived, never stored. */
export const CertStatus = {
  Requested: 1,
  FullySigned: 2,
  Claimed: 3,
  Revoked: 4,
} as const;
export type CertStatusName = keyof typeof CertStatus;
