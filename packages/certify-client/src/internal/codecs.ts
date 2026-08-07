/**
 * Internal byte-layout codecs — the SINGLE source of truth for on-chain and
 * instruction-data serialization (skill rule 1). NOT part of the public surface
 * (skill rule 6): the package exports guarded `decodeX` / `getXInstruction`
 * wrappers, never these raw codecs. Tests import this module by relative path to
 * roundtrip the codecs directly.
 *
 * Every account is a flat, hand-packed little-endian layout with no padding, so
 * field order here IS the byte order (skill rule 5). `u64`/`i64` -> `bigint`
 * (rule 4); 32-byte pubkeys -> `Address`, 32-byte hashes -> bytes.
 */

import {
  fixCodecSize,
  getAddressCodec,
  getArrayCodec,
  getBytesCodec,
  getI64Codec,
  getStructCodec,
  getU8Codec,
  getU64Codec,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";

import {
  CONFIG_MAX_ADMINS,
  EDITION_MAX_SIGNERS,
  EDITION_NAME_LEN,
  IxDisc,
  SIGNER_NAME_LEN,
  SIGNER_ROLE_LEN,
  ZERO_ADDRESS,
} from "../program";

// ---------------------------------------------------------------------------
// byte helpers
// ---------------------------------------------------------------------------

/** UTF-8 decode after stripping trailing NUL padding. */
export function trimZeroUtf8(bytes: ReadonlyUint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return new TextDecoder().decode(bytes.subarray(0, end));
}

/** UTF-8 encode `s` into exactly `n` bytes, truncated at a char boundary and NUL-padded. */
export function encodeUtf8Fixed(s: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  const raw = new TextEncoder().encode(s);
  let len = Math.min(raw.length, n);
  // Back off any partial UTF-8 multibyte sequence at the cut point.
  if (len < raw.length) {
    while (len > 0 && (raw[len] & 0b1100_0000) === 0b1000_0000) len--;
  }
  out.set(raw.subarray(0, len));
  return out;
}

/** True iff `a` is the all-zero pubkey (unset sentinel). */
export function isZeroAddress(a: Address): boolean {
  return a === ZERO_ADDRESS;
}

function requireLen(
  bytes: ReadonlyUint8Array,
  n: number,
  field: string,
): ReadonlyUint8Array {
  if (bytes.length !== n) {
    throw new RangeError(`${field}: expected ${n} bytes, got ${bytes.length}`);
  }
  return bytes;
}

const bytes32 = () => fixCodecSize(getBytesCodec(), 32);

// ---------------------------------------------------------------------------
// account codecs (§2)
// ---------------------------------------------------------------------------

export const configCodec = getStructCodec([
  ["disc", getU8Codec()],
  ["bump", getU8Codec()],
  ["adminCount", getU8Codec()],
  ["notary", getAddressCodec()],
  ["admins", getArrayCodec(getAddressCodec(), { size: CONFIG_MAX_ADMINS })],
  ["editionsCreated", getU64Codec()],
]);

/** One edition signer slot: pubkey(32) + name[32] + role[24] = 88 bytes. */
export const signerSlotCodec = getStructCodec([
  ["pubkey", getAddressCodec()],
  ["name", fixCodecSize(getBytesCodec(), SIGNER_NAME_LEN)],
  ["role", fixCodecSize(getBytesCodec(), SIGNER_ROLE_LEN)],
]);

export const editionCodec = getStructCodec([
  ["disc", getU8Codec()],
  ["bump", getU8Codec()],
  ["status", getU8Codec()],
  ["signerCount", getU8Codec()],
  ["id", getU64Codec()],
  ["name", fixCodecSize(getBytesCodec(), EDITION_NAME_LEN)],
  ["specHash", bytes32()],
  ["signers", getArrayCodec(signerSlotCodec, { size: EDITION_MAX_SIGNERS })],
  ["maxSupply", getU64Codec()],
  ["certsRequested", getU64Codec()],
  ["certsClosed", getU64Codec()],
  ["certsClaimed", getU64Codec()],
  ["createdAt", getI64Codec()],
]);

export const certificateCodec = getStructCodec([
  ["disc", getU8Codec()],
  ["bump", getU8Codec()],
  ["status", getU8Codec()],
  ["signedMask", getU8Codec()],
  ["edition", getAddressCodec()],
  ["student", getAddressCodec()],
  ["nameCommitment", bytes32()],
  ["artifactHash", bytes32()],
  ["asset", getAddressCodec()],
  ["certNumber", getU64Codec()],
  [
    "sigTimestamps",
    getArrayCodec(getI64Codec(), { size: EDITION_MAX_SIGNERS }),
  ],
  ["claimedAt", getI64Codec()],
]);

export const hashIndexCodec = getStructCodec([
  ["disc", getU8Codec()],
  ["bump", getU8Codec()],
  ["certificate", getAddressCodec()],
]);

// ---------------------------------------------------------------------------
// instruction-data codecs + encoders (§3) — data leads with the 1-byte disc
// ---------------------------------------------------------------------------

/** Ergonomic input for one edition signer slot. */
export type EditionSignerInput = {
  readonly pubkey: Address;
  readonly name: string;
  readonly role: string;
};

const keyDataCodec = getStructCodec([
  ["disc", getU8Codec()],
  ["key", getAddressCodec()],
]);

const initConfigDataCodec = getStructCodec([
  ["disc", getU8Codec()],
  ["notary", getAddressCodec()],
  ["adminCount", getU8Codec()],
  ["admins", getArrayCodec(getAddressCodec(), { size: CONFIG_MAX_ADMINS })],
]);

const createEditionDataCodec = getStructCodec([
  ["disc", getU8Codec()],
  ["name", fixCodecSize(getBytesCodec(), EDITION_NAME_LEN)],
  ["specHash", bytes32()],
  ["maxSupply", getU64Codec()],
  ["signerCount", getU8Codec()],
  ["signers", getArrayCodec(signerSlotCodec, { size: EDITION_MAX_SIGNERS })],
]);

const setEditionStatusDataCodec = getStructCodec([
  ["disc", getU8Codec()],
  ["status", getU8Codec()],
]);

const setMaxSupplyDataCodec = getStructCodec([
  ["disc", getU8Codec()],
  ["maxSupply", getU64Codec()],
]);

const hash33DataCodec = getStructCodec([
  ["disc", getU8Codec()],
  ["hash", bytes32()],
]);

function padAdmins(admins: readonly Address[]): Address[] {
  if (admins.length > CONFIG_MAX_ADMINS) {
    throw new RangeError(
      `too many admins: ${admins.length} > ${CONFIG_MAX_ADMINS}`,
    );
  }
  const out = admins.slice();
  while (out.length < CONFIG_MAX_ADMINS) out.push(ZERO_ADDRESS);
  return out;
}

function padSigners(signers: readonly EditionSignerInput[]) {
  if (signers.length > EDITION_MAX_SIGNERS) {
    throw new RangeError(
      `too many signers: ${signers.length} > ${EDITION_MAX_SIGNERS}`,
    );
  }
  const slots = signers.map((s) => ({
    pubkey: s.pubkey,
    name: encodeUtf8Fixed(s.name, SIGNER_NAME_LEN),
    role: encodeUtf8Fixed(s.role, SIGNER_ROLE_LEN),
  }));
  while (slots.length < EDITION_MAX_SIGNERS) {
    slots.push({
      pubkey: ZERO_ADDRESS,
      name: new Uint8Array(SIGNER_NAME_LEN),
      role: new Uint8Array(SIGNER_ROLE_LEN),
    });
  }
  return slots;
}

export const encodeInitConfigData = (
  notary: Address,
  admins: readonly Address[],
) =>
  initConfigDataCodec.encode({
    disc: IxDisc.InitConfig,
    notary,
    adminCount: admins.length,
    admins: padAdmins(admins),
  });

export const encodeAddAdminData = (admin: Address) =>
  keyDataCodec.encode({ disc: IxDisc.AddAdmin, key: admin });

export const encodeRemoveAdminData = (admin: Address) =>
  keyDataCodec.encode({ disc: IxDisc.RemoveAdmin, key: admin });

export const encodeSetNotaryData = (notary: Address) =>
  keyDataCodec.encode({ disc: IxDisc.SetNotary, key: notary });

export const encodeCreateEditionData = (input: {
  name: string;
  specHash: ReadonlyUint8Array;
  maxSupply: bigint;
  signers: readonly EditionSignerInput[];
}) =>
  createEditionDataCodec.encode({
    disc: IxDisc.CreateEdition,
    name: encodeUtf8Fixed(input.name, EDITION_NAME_LEN),
    specHash: requireLen(input.specHash, 32, "specHash"),
    maxSupply: input.maxSupply,
    signerCount: input.signers.length,
    signers: padSigners(input.signers),
  });

export const encodeSetEditionStatusData = (status: number) =>
  setEditionStatusDataCodec.encode({ disc: IxDisc.SetEditionStatus, status });

export const encodeSetMaxSupplyData = (maxSupply: bigint) =>
  setMaxSupplyDataCodec.encode({ disc: IxDisc.SetMaxSupply, maxSupply });

export const encodeRequestCertificateData = (commitment: ReadonlyUint8Array) =>
  hash33DataCodec.encode({
    disc: IxDisc.RequestCertificate,
    hash: requireLen(commitment, 32, "commitment"),
  });

export const encodeClaimCertificateData = (artifactHash: ReadonlyUint8Array) =>
  hash33DataCodec.encode({
    disc: IxDisc.ClaimCertificate,
    hash: requireLen(artifactHash, 32, "artifactHash"),
  });

export const encodeRecordAssetData = (asset: Address) =>
  keyDataCodec.encode({ disc: IxDisc.RecordAsset, key: asset });

export const encodeSignCertificateData = () =>
  new Uint8Array([IxDisc.SignCertificate]);
export const encodeRejectRequestData = () =>
  new Uint8Array([IxDisc.RejectRequest]);
export const encodeRevokeCertificateData = () =>
  new Uint8Array([IxDisc.RevokeCertificate]);
