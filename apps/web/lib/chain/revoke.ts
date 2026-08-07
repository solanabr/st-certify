import "server-only";

import { address as toAddress } from "@solana/kit";
import {
  fetchCertificate,
  findConfigPda,
  getRevokeCertificateInstruction,
} from "@certify/client";
import { fail } from "@/lib/errors";
import { getRpc, programDeployed, rpcConfigured } from "@/lib/chain";
import { submitAndSyncTransaction } from "@/lib/chain/server";
import { getServerSigner, signServerTx } from "@/lib/chain/server-tx";
import { burnCertificateAsset } from "@/lib/chain/mint";
import { markCertificateRevoked } from "@/lib/db/claim-verify-mutations";

export interface RevokeCertificateInput {
  certificateAddress: string;
  reason: string;
  actor?: string;
}

export interface RevokeCertificateResult {
  signature: string | null;
  /** True if the on-chain asset was burned (best-effort — never blocks REVOKED). */
  burned: boolean;
  alreadyRevoked: boolean;
}

/**
 * Revokes a certificate with two distinct admin signatures (OPERATOR fee-payer +
 * admin, DEPLOYER co-admin — the destructive-class threshold), records the
 * reason off-chain, then best-effort burns the soulbound asset via OPERATOR's
 * PermanentBurnDelegate. A burn failure is logged and swallowed: REVOKED stands
 * regardless (plan §Revoke). Idempotent — a second call on an already-Revoked
 * cert skips the tx and just reconciles reason + burn.
 */
export async function revokeCertificate(
  input: RevokeCertificateInput,
): Promise<RevokeCertificateResult> {
  if (!rpcConfigured) {
    fail("CHAIN_RPC_UNAVAILABLE", "RPC não configurado.");
  }
  if (!programDeployed) {
    fail(
      "CHAIN_PROGRAM_NOT_DEPLOYED",
      "O programa on-chain ainda não foi implantado.",
      { retryable: true },
    );
  }

  const rpc = getRpc();
  const certAddr = toAddress(input.certificateAddress);
  const cert = await fetchCertificate(rpc, certAddr);
  if (!cert) {
    fail("NOT_FOUND", "Certificado não encontrado on-chain.");
  }

  const asset = cert.asset;
  const alreadyRevoked = cert.status === "Revoked";
  let signature: string | null = null;

  if (!alreadyRevoked) {
    const [configPda] = await findConfigPda();
    const operator = await getServerSigner("operator");
    const deployer = await getServerSigner("deployer");

    const revokeIx = getRevokeCertificateInstruction({
      config: configPda,
      certificate: certAddr,
      adminSigners: [operator, deployer],
    });
    const signed = await signServerTx(revokeIx, operator);
    const result = await submitAndSyncTransaction({
      wireBytesBase64: signed.wireBytesBase64,
      lastValidBlockHeight: signed.lastValidBlockHeight,
      syncTargets: [{ kind: "certificate", address: input.certificateAddress }],
      eventType: "certificate_revoked",
      actor: input.actor,
      certificateTxField: "revoke_tx",
      eventPayload: { reason: input.reason },
    });
    signature = result.signature;
  }

  await markCertificateRevoked(input.certificateAddress, input.reason);

  // Best-effort burn — a failure here never invalidates the revocation.
  let burned = false;
  if (asset) {
    try {
      await burnCertificateAsset({
        asset,
        certificateAddress: input.certificateAddress,
      });
      burned = true;
    } catch (err) {
      console.error(
        `revoke: burn of asset ${asset} failed (non-fatal):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { signature, burned, alreadyRevoked };
}
