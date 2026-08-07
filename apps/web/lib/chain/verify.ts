// Client-safe verify helpers (no server-only): the browser verify island imports
// these directly. @certify/client + kit are allowed here (lib/chain is their
// fenced home); everything returned is plain string/number so the calling
// component stays fenced off from kit's branded types.

import { address as toAddress } from "@solana/kit";
import {
  fetchCertificate,
  fetchEdition,
  fetchHashIndex,
  findHashIndexPda,
} from "@certify/client";
import { getRpc, rpcConfigured } from "./rpc";

const HEX64 = /^[0-9a-fA-F]{64}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type VerifyInput =
  | { kind: "empty" }
  | { kind: "hash"; value: string }
  | { kind: "base58"; value: string }
  | { kind: "unknown"; value: string };

/**
 * Pure disambiguation of the verify page's smart input (plan §Verify): a
 * `/verify/<x>` URL unwraps to its last segment and re-classifies; a 64-hex
 * string is an artifact hash; a 32–44 base58 string is a cert-PDA-or-asset
 * address; anything else is unknown. Deterministic + side-effect-free (unit
 * tested).
 */
export function classifyVerifyInput(raw: string): VerifyInput {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "empty" };

  const urlMatch = trimmed.match(/\/verify\/([^/?#\s]+)/);
  if (urlMatch) {
    return classifyVerifyInput(decodeURIComponent(urlMatch[1]));
  }

  const lower = trimmed.toLowerCase();
  if (HEX64.test(trimmed)) return { kind: "hash", value: lower };
  if (BASE58.test(trimmed)) return { kind: "base58", value: trimmed };
  return { kind: "unknown", value: trimmed };
}

export interface VerifyReconcile {
  /** Show the NFT link only when the on-chain Certificate.asset exists (back-reference doctrine). */
  showNftLink: boolean;
  nftAsset: string | null;
  /** Chain status diverges from the mirror — chain wins; surface a "atualizando" note. */
  drifted: boolean;
}

/**
 * Pure reconciliation of the live chain verdict against the mirror-rendered one
 * (unit tested). The NFT link is derived ONLY from the on-chain asset; a
 * Claimed/Revoked divergence from the mirror flags drift.
 */
export function reconcileChainVerdict(input: {
  exists: boolean;
  chainStatus: string;
  chainAsset: string | null;
  mirrorStatus: string;
}): VerifyReconcile {
  const drifted =
    input.exists &&
    ((input.chainStatus === "Claimed" && input.mirrorStatus !== "Claimed") ||
      (input.chainStatus === "Revoked" && input.mirrorStatus !== "Revoked"));
  return {
    showNftLink: input.exists && input.chainAsset !== null,
    nftAsset: input.chainAsset,
    drifted,
  };
}

/** WebCrypto sha256 of raw bytes → lowercase hex (uploaded-file hashing path). */
export async function sha256HexOf(bytes: Uint8Array): Promise<string> {
  const view = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Resolve an artifact hash to its certificate PDA via the on-chain HashIndex, or null. */
export async function resolveHashToCert(
  hashHex: string,
): Promise<string | null> {
  if (!rpcConfigured || !HEX64.test(hashHex)) return null;
  const bytes = new Uint8Array(
    hashHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
  );
  const [pda] = await findHashIndexPda(bytes);
  const hashIndex = await fetchHashIndex(getRpc(), pda);
  return hashIndex ? hashIndex.certificate : null;
}

export interface OnChainSignerCheck {
  position: number;
  signed: boolean;
  signedAtUnix: number | null;
}

export interface OnChainVerdict {
  exists: boolean;
  status: string;
  signedMask: number;
  certNumber: number;
  /** Certificate.asset read LIVE from chain — the NFT link is derived from this (back-reference doctrine). */
  asset: string | null;
  artifactSha256Hex: string;
  edition: string;
  student: string;
  /** Slot the chain-check observed, for the "verificado onchain · slot N" stamp. */
  slot: string;
  signers: OnChainSignerCheck[];
}

/**
 * The browser chain-check behind the "verificado onchain · slot N" stamp:
 * fetches the Certificate (+ its Edition for signer count) and the current slot,
 * returning a plain verdict. The `asset` here is authoritative — the verify page
 * shows the NFT link only for this on-chain value, enforcing Certificate.asset ↔
 * asset. Returns `{ exists: false }` when the PDA has no account.
 */
export async function checkCertificateOnChain(
  certAddress: string,
): Promise<OnChainVerdict> {
  const rpc = getRpc();
  const addr = toAddress(certAddress);
  const [cert, slot] = await Promise.all([
    fetchCertificate(rpc, addr),
    rpc.getSlot().send(),
  ]);

  if (!cert) {
    return {
      exists: false,
      status: "NotFound",
      signedMask: 0,
      certNumber: 0,
      asset: null,
      artifactSha256Hex: "",
      edition: "",
      student: "",
      slot: slot.toString(),
      signers: [],
    };
  }

  const edition = await fetchEdition(rpc, cert.edition);
  const signerCount = edition?.signerCount ?? cert.sigTimestamps.length;

  const signers: OnChainSignerCheck[] = [];
  for (let i = 0; i < signerCount; i++) {
    const ts = cert.sigTimestamps[i] ?? 0n;
    signers.push({
      position: i,
      signed: (cert.signedMask & (1 << i)) !== 0,
      signedAtUnix: ts > 0n ? Number(ts) : null,
    });
  }

  return {
    exists: true,
    status: cert.status,
    signedMask: cert.signedMask,
    certNumber: Number(cert.certNumber),
    asset: cert.asset,
    artifactSha256Hex: Array.from(cert.artifactHash)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
    edition: cert.edition,
    student: cert.student,
    slot: slot.toString(),
    signers,
  };
}
