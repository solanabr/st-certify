/**
 * Program-derived-address helpers. Byte seeds via kit `getProgramDerivedAddress`
 * (async). String seeds are UTF-8 encoded (matching Rust `b"literal"`); the u64
 * edition id and 32-byte addresses/hashes are encoded to their exact on-chain
 * bytes so the client and program derive identical addresses.
 */

import {
  getAddressEncoder,
  getProgramDerivedAddress,
  getU64Codec,
  type Address,
  type ProgramDerivedAddress,
  type ReadonlyUint8Array,
} from "@solana/kit";

import { PROGRAM_ID } from "./program";

const addressEncoder = getAddressEncoder();
const u64 = getU64Codec();

/** Config singleton PDA — seeds `[b"config"]`. */
export function findConfigPda(): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ["config"],
  });
}

/** Edition PDA — seeds `[b"edition", id_le]`. */
export function findEditionPda(id: bigint): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ["edition", u64.encode(id)],
  });
}

/** Certificate PDA — seeds `[b"cert", edition, student]`. */
export function findCertPda(
  edition: Address,
  student: Address,
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [
      "cert",
      addressEncoder.encode(edition),
      addressEncoder.encode(student),
    ],
  });
}

/** HashIndex PDA — seeds `[b"hash", artifact_hash]` (32-byte hash). */
export function findHashIndexPda(
  artifactHash: ReadonlyUint8Array,
): Promise<ProgramDerivedAddress> {
  if (artifactHash.length !== 32) {
    throw new RangeError(
      `artifactHash: expected 32 bytes, got ${artifactHash.length}`,
    );
  }
  return getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: ["hash", artifactHash],
  });
}
