/**
 * Public account decoders. Each guards `data.length` and the discriminator byte
 * before decoding and returns a friendly typed object (status enums resolved,
 * `PartiallySigned` derived, names zero-trimmed, `u64`/`i64` as `bigint`, unset
 * `asset` as `null`). Malformed buffers raise a typed {@link CodecError}, never a
 * raw range error (skill rule 8).
 */

import type { Address, ReadonlyUint8Array } from "@solana/kit";

import { CodecError } from "./errors";
import {
  ACCOUNT_SIZES,
  AccountDisc,
  CertStatus,
  EditionStatus,
  type CertStatusName,
  type EditionStatusName,
} from "./program";
import {
  certificateCodec,
  configCodec,
  editionCodec,
  hashIndexCodec,
  isZeroAddress,
  trimZeroUtf8,
} from "./internal/codecs";

// ---------------------------------------------------------------------------
// decoded shapes
// ---------------------------------------------------------------------------

export type DecodedConfig = {
  readonly bump: number;
  readonly adminCount: number;
  readonly notary: Address;
  /** Active admins (`admins[..adminCount]`); zeroed padding slots are dropped. */
  readonly admins: Address[];
  readonly editionsCreated: bigint;
};

export type EditionSignerSlot = {
  readonly pubkey: Address;
  readonly name: string;
  readonly role: string;
};

export type DecodedEdition = {
  readonly bump: number;
  readonly status: EditionStatusName;
  readonly signerCount: number;
  readonly id: bigint;
  readonly name: string;
  readonly specHash: Uint8Array;
  /** Active signers (`signers[..signerCount]`); mask bit `i` maps to `signers[i]`. */
  readonly signers: EditionSignerSlot[];
  readonly maxSupply: bigint;
  readonly certsRequested: bigint;
  readonly certsClosed: bigint;
  readonly certsClaimed: bigint;
  readonly createdAt: bigint;
};

export type DecodedCertificate = {
  readonly bump: number;
  readonly status: CertStatusName;
  /** Derived: `status === 'Requested' && signedMask !== 0`. Never stored on-chain. */
  readonly isPartiallySigned: boolean;
  readonly signedMask: number;
  readonly edition: Address;
  readonly student: Address;
  readonly nameCommitment: Uint8Array;
  readonly artifactHash: Uint8Array;
  /** The minted asset, or `null` if not yet recorded. */
  readonly asset: Address | null;
  readonly certNumber: bigint;
  /** Per-signer signature times (all 6 slots; index by signer position). */
  readonly sigTimestamps: bigint[];
  readonly claimedAt: bigint;
};

export type DecodedHashIndex = {
  readonly bump: number;
  readonly certificate: Address;
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const editionStatusByByte = Object.fromEntries(
  Object.entries(EditionStatus).map(([k, v]) => [v, k]),
) as Record<number, EditionStatusName>;

const certStatusByByte = Object.fromEntries(
  Object.entries(CertStatus).map(([k, v]) => [v, k]),
) as Record<number, CertStatusName>;

function guard(
  data: ReadonlyUint8Array,
  size: number,
  disc: number,
  label: string,
): void {
  if (data.length !== size) {
    throw new CodecError(
      "WrongSize",
      `${label}: expected ${size} bytes, got ${data.length}`,
    );
  }
  if (data[0] !== disc) {
    throw new CodecError(
      "WrongDiscriminator",
      `${label}: discriminator ${data[0]} != ${disc}`,
    );
  }
}

function editionStatusName(byte: number): EditionStatusName {
  const name = editionStatusByByte[byte];
  if (name === undefined)
    throw new CodecError("InvalidStatus", `edition status byte ${byte}`);
  return name;
}

function certStatusName(byte: number): CertStatusName {
  const name = certStatusByByte[byte];
  if (name === undefined)
    throw new CodecError("InvalidStatus", `certificate status byte ${byte}`);
  return name;
}

const copyBytes = (b: ReadonlyUint8Array): Uint8Array => Uint8Array.from(b);

// ---------------------------------------------------------------------------
// decoders
// ---------------------------------------------------------------------------

export function decodeConfig(data: ReadonlyUint8Array): DecodedConfig {
  guard(data, ACCOUNT_SIZES.config, AccountDisc.Config, "Config");
  const raw = configCodec.decode(data);
  return {
    bump: raw.bump,
    adminCount: raw.adminCount,
    notary: raw.notary,
    admins: raw.admins.slice(0, raw.adminCount),
    editionsCreated: raw.editionsCreated,
  };
}

export function decodeEdition(data: ReadonlyUint8Array): DecodedEdition {
  guard(data, ACCOUNT_SIZES.edition, AccountDisc.Edition, "Edition");
  const raw = editionCodec.decode(data);
  return {
    bump: raw.bump,
    status: editionStatusName(raw.status),
    signerCount: raw.signerCount,
    id: raw.id,
    name: trimZeroUtf8(raw.name),
    specHash: copyBytes(raw.specHash),
    signers: raw.signers.slice(0, raw.signerCount).map((s) => ({
      pubkey: s.pubkey,
      name: trimZeroUtf8(s.name),
      role: trimZeroUtf8(s.role),
    })),
    maxSupply: raw.maxSupply,
    certsRequested: raw.certsRequested,
    certsClosed: raw.certsClosed,
    certsClaimed: raw.certsClaimed,
    createdAt: raw.createdAt,
  };
}

export function decodeCertificate(
  data: ReadonlyUint8Array,
): DecodedCertificate {
  guard(
    data,
    ACCOUNT_SIZES.certificate,
    AccountDisc.Certificate,
    "Certificate",
  );
  const raw = certificateCodec.decode(data);
  return {
    bump: raw.bump,
    status: certStatusName(raw.status),
    isPartiallySigned:
      raw.status === CertStatus.Requested && raw.signedMask !== 0,
    signedMask: raw.signedMask,
    edition: raw.edition,
    student: raw.student,
    nameCommitment: copyBytes(raw.nameCommitment),
    artifactHash: copyBytes(raw.artifactHash),
    asset: isZeroAddress(raw.asset) ? null : raw.asset,
    certNumber: raw.certNumber,
    sigTimestamps: raw.sigTimestamps.slice(),
    claimedAt: raw.claimedAt,
  };
}

export function decodeHashIndex(data: ReadonlyUint8Array): DecodedHashIndex {
  guard(data, ACCOUNT_SIZES.hashIndex, AccountDisc.HashIndex, "HashIndex");
  const raw = hashIndexCodec.decode(data);
  return { bump: raw.bump, certificate: raw.certificate };
}
