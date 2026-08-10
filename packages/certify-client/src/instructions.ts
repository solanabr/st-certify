/**
 * Instruction builders — one per program instruction (13), returning a kit
 * `Instruction` with account metas in the program's normative order (appendix §3)
 * and correct roles. Signing accounts are `TransactionSigner`s (attached to the
 * meta so `signTransactionMessageWithSigners` collects them); non-signers are
 * plain `Address`. Admin-gated ops take `adminSigners: TransactionSigner[]`
 * appended as trailing read-only signer metas (2 pairwise-distinct for the
 * destructive class, 1 for the operator class).
 */

import {
  AccountRole,
  type AccountMeta,
  type AccountSignerMeta,
  type Address,
  type Instruction,
  type ReadonlyUint8Array,
  type TransactionSigner,
} from "@solana/kit";

import { PROGRAM_ID, SYSTEM_PROGRAM_ID } from "./program";
import {
  encodeAddAdminData,
  encodeClaimCertificateData,
  encodeCreateEditionData,
  encodeInitConfigData,
  encodeRecordAssetData,
  encodeRejectRequestData,
  encodeRemoveAdminData,
  encodeRequestCertificateData,
  encodeRevokeCertificateData,
  encodeSetEditionStatusData,
  encodeSetMaxSupplyData,
  encodeSetNotaryData,
  encodeSignCertificateData,
  type EditionSignerInput,
} from "./internal/codecs";

export type { EditionSignerInput };

type Meta = AccountMeta | AccountSignerMeta;

const ro = (address: Address): AccountMeta => ({
  address,
  role: AccountRole.READONLY,
});
const wr = (address: Address): AccountMeta => ({
  address,
  role: AccountRole.WRITABLE,
});
const roSigner = (signer: TransactionSigner): AccountSignerMeta => ({
  address: signer.address,
  role: AccountRole.READONLY_SIGNER,
  signer,
});
const wrSigner = (signer: TransactionSigner): AccountSignerMeta => ({
  address: signer.address,
  role: AccountRole.WRITABLE_SIGNER,
  signer,
});

const ix = (accounts: Meta[], data: ReadonlyUint8Array): Instruction => ({
  programAddress: PROGRAM_ID,
  accounts,
  data,
});

// --- config / admin ---------------------------------------------------------

export function getInitConfigInstruction(input: {
  payer: TransactionSigner;
  config: Address;
  notary: Address;
  admins: readonly Address[];
}): Instruction {
  return ix(
    [wrSigner(input.payer), wr(input.config), ro(SYSTEM_PROGRAM_ID)],
    encodeInitConfigData(input.notary, input.admins),
  );
}

export function getAddAdminInstruction(input: {
  config: Address;
  newAdmin: Address;
  adminSigners: readonly TransactionSigner[];
}): Instruction {
  return ix(
    [wr(input.config), ...input.adminSigners.map(roSigner)],
    encodeAddAdminData(input.newAdmin),
  );
}

export function getRemoveAdminInstruction(input: {
  config: Address;
  admin: Address;
  adminSigners: readonly TransactionSigner[];
}): Instruction {
  return ix(
    [wr(input.config), ...input.adminSigners.map(roSigner)],
    encodeRemoveAdminData(input.admin),
  );
}

export function getSetNotaryInstruction(input: {
  config: Address;
  notary: Address;
  adminSigners: readonly TransactionSigner[];
}): Instruction {
  return ix(
    [wr(input.config), ...input.adminSigners.map(roSigner)],
    encodeSetNotaryData(input.notary),
  );
}

// --- edition ----------------------------------------------------------------

export function getCreateEditionInstruction(input: {
  payer: TransactionSigner;
  config: Address;
  edition: Address;
  name: string;
  specHash: ReadonlyUint8Array;
  maxSupply: bigint;
  signers: readonly EditionSignerInput[];
  adminSigners: readonly TransactionSigner[];
}): Instruction {
  return ix(
    [
      wrSigner(input.payer),
      wr(input.config),
      wr(input.edition),
      ro(SYSTEM_PROGRAM_ID),
      ...input.adminSigners.map(roSigner),
    ],
    encodeCreateEditionData({
      name: input.name,
      specHash: input.specHash,
      maxSupply: input.maxSupply,
      signers: input.signers,
    }),
  );
}

export function getSetEditionStatusInstruction(input: {
  config: Address;
  edition: Address;
  status: number;
  adminSigners: readonly TransactionSigner[];
}): Instruction {
  return ix(
    [ro(input.config), wr(input.edition), ...input.adminSigners.map(roSigner)],
    encodeSetEditionStatusData(input.status),
  );
}

export function getSetMaxSupplyInstruction(input: {
  config: Address;
  edition: Address;
  maxSupply: bigint;
  adminSigners: readonly TransactionSigner[];
}): Instruction {
  return ix(
    [ro(input.config), wr(input.edition), ...input.adminSigners.map(roSigner)],
    encodeSetMaxSupplyData(input.maxSupply),
  );
}

// --- certificate lifecycle --------------------------------------------------

export function getRequestCertificateInstruction(input: {
  student: TransactionSigner;
  edition: Address;
  certificate: Address;
  nameCommitment: ReadonlyUint8Array;
}): Instruction {
  return ix(
    [
      wrSigner(input.student),
      wr(input.edition),
      wr(input.certificate),
      ro(SYSTEM_PROGRAM_ID),
    ],
    encodeRequestCertificateData(input.nameCommitment),
  );
}

export function getSignCertificateInstruction(input: {
  signer: TransactionSigner;
  edition: Address;
  certificate: Address;
}): Instruction {
  return ix(
    [roSigner(input.signer), ro(input.edition), wr(input.certificate)],
    encodeSignCertificateData(),
  );
}

/**
 * reject_request (merged reject + close). Authority is any single edition signer
 * OR any single admin, appended as trailing read-only signer metas. The refund is
 * address-targeted to `studentRefund` (must equal `cert.student`); no student
 * signature is required.
 */
export function getRejectRequestInstruction(input: {
  config: Address;
  edition: Address;
  certificate: Address;
  studentRefund: Address;
  authoritySigners: readonly TransactionSigner[];
}): Instruction {
  return ix(
    [
      ro(input.config),
      wr(input.edition),
      wr(input.certificate),
      wr(input.studentRefund),
      ...input.authoritySigners.map(roSigner),
    ],
    encodeRejectRequestData(),
  );
}

/** Alias for {@link getRejectRequestInstruction} matching the app surface (§1.5). */
export const getCloseCertificateInstruction = getRejectRequestInstruction;

export function getClaimCertificateInstruction(input: {
  student: TransactionSigner;
  notary: TransactionSigner;
  config: Address;
  edition: Address;
  certificate: Address;
  hashIndex: Address;
  artifactHash: ReadonlyUint8Array;
}): Instruction {
  return ix(
    [
      wrSigner(input.student),
      roSigner(input.notary),
      ro(input.config),
      wr(input.edition),
      wr(input.certificate),
      wr(input.hashIndex),
      ro(SYSTEM_PROGRAM_ID),
    ],
    encodeClaimCertificateData(input.artifactHash),
  );
}

export function getRecordAssetInstruction(input: {
  config: Address;
  certificate: Address;
  asset: Address;
  adminSigners: readonly TransactionSigner[];
}): Instruction {
  return ix(
    [
      ro(input.config),
      wr(input.certificate),
      ...input.adminSigners.map(roSigner),
    ],
    encodeRecordAssetData(input.asset),
  );
}

export function getRevokeCertificateInstruction(input: {
  config: Address;
  certificate: Address;
  adminSigners: readonly TransactionSigner[];
}): Instruction {
  return ix(
    [
      ro(input.config),
      wr(input.certificate),
      ...input.adminSigners.map(roSigner),
    ],
    encodeRevokeCertificateData(),
  );
}
