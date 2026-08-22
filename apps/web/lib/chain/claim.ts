import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  address as toAddress,
  appendTransactionMessageInstruction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import {
  fetchCertificate,
  fetchEdition,
  findConfigPda,
  findHashIndexPda,
  getClaimCertificateInstruction,
  getRecordAssetInstruction,
  type DecodedCertificate,
} from "@certify/client";
import { fail } from "@/lib/errors";
import { getRpc, programDeployed, rpcConfigured } from "@/lib/chain";
import { submitAndSyncTransaction } from "@/lib/chain/server";
import { getServerSigner, signServerTx } from "@/lib/chain/server-tx";
import { mintCertificateAsset } from "@/lib/chain/mint";
import {
  claimSubmitPlan,
  nameCommitmentMatches,
} from "@/lib/chain/claim-logic";
import { renderCertificate } from "@/lib/render/render";
import { buildMetadataJson, type MetadataSigner } from "@/lib/render/metadata";
import {
  getTemplateBytes,
  storeArtifact,
  storeTemplate,
} from "@/lib/render/storage";
import { layoutSchema, type Layout } from "@/lib/render/layout";
import {
  dbConfigured,
  getCertificateByAddress,
  getEditionByAddress,
} from "@/lib/db/queries";
import type { CertificateRow, EditionWithSigners } from "@/lib/db/types";
import {
  markCertificateClaimed,
  setCertificateArtifact,
} from "@/lib/db/claim-verify-mutations";
import {
  recordCertificateCluster,
  syncCertificateMirrorFromChain,
} from "@/lib/db/mutations";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "assets",
  "templates",
  "default-superteam-br.png",
);

const toHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

/** Supabase public object URL, computed without importing @supabase (kept behind the lib/db fence). */
function publicStorageUrl(bucket: string, objectPath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
}

/**
 * Base URL for the verify link. That link is permanent — it is rendered into
 * the certificate PNG whose hash is committed on-chain, and written into the
 * NFT's metadata — so falling back to localhost in production would mint dead
 * links that can never be corrected. Fail there instead; keep the fallback
 * for local dev, where it is the right answer.
 */
function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) {
    return url;
  }
  if (process.env.NODE_ENV === "production") {
    fail("STORAGE_FAILED", "NEXT_PUBLIC_APP_URL não configurado.");
  }
  return "http://localhost:3000";
}

/**
 * The network this claim is being recorded on. Read once here and stamped on
 * the mirror, because the exported PDF prints the network and links its
 * explorer from it — asking the environment at export time would let a mainnet
 * cutover silently re-attribute every devnet certificate ever issued. The
 * fallback in lib/pdf/source.ts mirrors this rule for rows written before
 * migration 0006.
 */
function currentCluster(): string {
  return (process.env.NEXT_PUBLIC_RPC_URL ?? "").includes("devnet")
    ? "devnet"
    : "mainnet-beta";
}

function assertClaimReady(): void {
  if (!rpcConfigured) {
    fail("CHAIN_RPC_UNAVAILABLE", "RPC não configurado.");
  }
  if (!programDeployed) {
    fail(
      "CHAIN_PROGRAM_NOT_DEPLOYED",
      "O programa on-chain ainda não foi implantado. Tente novamente em breve.",
      { retryable: true },
    );
  }
  if (!dbConfigured) {
    fail(
      "STORAGE_FAILED",
      "Armazenamento (Supabase) não configurado — resgate indisponível.",
      { retryable: true },
    );
  }
}

/**
 * Deterministic date shown on the certificate — the edition's completion date
 * if set, else the request date (both stable across prepare/submit, so the
 * rendered PNG's hash never drifts between the two calls).
 */
function certDateText(
  edition: EditionWithSigners,
  cert: CertificateRow,
): string {
  const iso = edition.completionDate ?? cert.created_at;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

interface ClaimArtifact {
  png: Buffer;
  sha256hex: string;
  layout: Layout;
  dateText: string;
  verifyUrl: string;
  metadataSigners: MetadataSigner[];
}

/**
 * The notary gate + canonical render, shared so prepare and any re-derivation
 * agree byte-for-byte. Refuses (never renders) when the stored name+salt don't
 * reproduce the on-chain `name_commitment` — the human trust boundary the notary
 * co-signature attests to.
 */
async function buildClaimArtifact(input: {
  certificateAddress: string;
  onchainCert: DecodedCertificate;
  edition: EditionWithSigners;
  cert: CertificateRow;
}): Promise<ClaimArtifact> {
  const { certificateAddress, onchainCert, edition, cert } = input;

  if (!cert.name_salt) {
    fail("STORAGE_FAILED", "Dados do nome ausentes no espelho.", {
      retryable: true,
    });
  }

  // Notary gate: refuse if the stored name+salt don't reproduce the commitment.
  if (
    !nameCommitmentMatches(
      cert.name_salt,
      cert.student_name,
      onchainCert.nameCommitment,
    )
  ) {
    fail(
      "CERT_STATE_CONFLICT",
      "Não foi possível verificar o nome deste certificado. Contate o administrador.",
    );
  }

  if (!edition.layout) {
    fail("RENDER_FAILED", "Layout da edição ausente.");
  }
  const layout = layoutSchema.parse(edition.layout);

  // Resolves by content-address: the committed default locally, any custom
  // upload from Supabase Storage — and asserts the bytes hash to
  // `layout.template.sha256` either way (see getTemplateBytes).
  const templatePng = await getTemplateBytes(layout.template.sha256);

  const orderedSigners = [...edition.signers].sort(
    (a, b) => a.position - b.position,
  );
  if (orderedSigners.length !== layout.signatures.length) {
    fail(
      "RENDER_FAILED",
      "Número de signatários não corresponde ao layout da edição.",
    );
  }

  const verifyUrl = `${appUrl()}/verify/${certificateAddress}`;
  const dateText = certDateText(edition, cert);

  const txByWallet = new Map((cert.signer_txs ?? []).map((t) => [t.wallet, t]));
  const metadataSigners: MetadataSigner[] = orderedSigners.map((s) => ({
    wallet: s.wallet,
    name: s.name,
    role: s.role ?? "",
    txSig: txByWallet.get(s.wallet)?.tx ?? null,
  }));

  const rendered = await renderCertificate({
    templatePng,
    layout,
    values: {
      studentName: cert.student_name,
      dateText,
      certId: certificateAddress,
      verifyUrl,
    },
    signers: orderedSigners.map((s) => ({ name: s.name, role: s.role ?? "" })),
  });

  return {
    png: rendered.png,
    sha256hex: rendered.sha256hex,
    layout,
    dateText,
    verifyUrl,
    metadataSigners,
  };
}

export interface PrepareClaimInput {
  certificateAddress: string;
  callerWallets: string[];
}

export interface PrepareClaimResult {
  wireTxBase64: string;
  lastValidBlockHeight: string;
  /** The wallet that must complete the co-signature (the cert's on-chain student). */
  studentWallet: string;
  imageUrl: string;
  /** Hex sha256 of the canonical PNG == the artifact hash committed on-chain. */
  hash: string;
}

/**
 * Renders the canonical artifact, stores it (content-addressed), persists its
 * coordinates on the mirror, and returns a NOTARY-partially-signed
 * `claim_certificate` transaction (fee payer = student) for the student's wallet
 * to complete. Idempotent: re-render ⇒ same bytes ⇒ same URLs; re-callable when
 * a blockhash expires.
 */
export async function prepareClaim(
  input: PrepareClaimInput,
): Promise<PrepareClaimResult> {
  assertClaimReady();
  const rpc = getRpc();
  const certAddr = toAddress(input.certificateAddress);

  const onchainCert = await fetchCertificate(rpc, certAddr);
  if (!onchainCert) {
    fail("NOT_FOUND", "Certificado não encontrado on-chain.");
  }
  if (onchainCert.status !== "FullySigned") {
    fail(
      "CERT_STATE_CONFLICT",
      "Este certificado ainda não está pronto para resgate.",
    );
  }
  if (!input.callerWallets.includes(onchainCert.student)) {
    fail("FORBIDDEN", "Este certificado não pertence à sua conta.");
  }

  const cert = await getCertificateByAddress(input.certificateAddress);
  if (!cert) {
    fail("NOT_FOUND", "Certificado não encontrado no espelho.");
  }
  const edition = await getEditionByAddress(onchainCert.edition);
  if (!edition) {
    fail("NOT_FOUND", "Edição do certificado não encontrada.");
  }

  const artifact = await buildClaimArtifact({
    certificateAddress: input.certificateAddress,
    onchainCert,
    edition,
    cert,
  });

  const imageUrl = publicStorageUrl("certs", `${artifact.sha256hex}.png`);
  const templateUrl = publicStorageUrl(
    "templates",
    `${artifact.layout.template.sha256}.png`,
  );

  const metadata = buildMetadataJson({
    editionName: edition.name,
    certNumber: edition.minted + 1, // provisional; asset.name uses the chain number at mint
    maxSupply: edition.maxSupply || undefined,
    artifactSha256Hex: artifact.sha256hex,
    imageUrl,
    externalUrl: artifact.verifyUrl,
    templateUrl,
    layout: artifact.layout,
    values: {
      studentName: cert.student_name,
      // The name_salt is deliberately withheld from the published JSON: erasure
      // (deleting the mirror row) only restores unlinkability if no archived
      // copy can re-prove sha256(salt‖name) against the chain. The plaintext
      // name here is a removable assertion; name+salt would be a permanent proof.
      dateText: artifact.dateText,
      certId: input.certificateAddress,
    },
    signers: artifact.metadataSigners,
  });

  // Make the template resolvable for the metadata render_spec, then store the
  // artifact + metadata (content-addressed, upsert — idempotent).
  await storeTemplate(readFileSync(TEMPLATE_PATH));
  const stored = await storeArtifact(artifact.png, metadata);
  if (!stored.stored) {
    fail(
      "STORAGE_FAILED",
      `Falha ao armazenar o certificado: ${stored.reason}`,
      {
        retryable: true,
      },
    );
  }

  await setCertificateArtifact(input.certificateAddress, {
    sha256: artifact.sha256hex,
    imageUrl: stored.pngUrl,
    metadataUrl: stored.metadataUrl,
  });
  // Separate, best-effort statement: migration 0006 may not be applied, and a
  // missing column must not be able to block a claim.
  await recordCertificateCluster(input.certificateAddress, currentCluster());

  // Build the notary-partially-signed claim tx (student completes it).
  const [configPda] = await findConfigPda();
  const artifactHash = new Uint8Array(Buffer.from(artifact.sha256hex, "hex"));
  const [hashIndex] = await findHashIndexPda(artifactHash);
  const notary = await getServerSigner("notary");
  const studentAddr = toAddress(onchainCert.student);

  const claimIx = getClaimCertificateInstruction({
    student: createNoopSigner(studentAddr),
    notary,
    config: configPda,
    edition: onchainCert.edition,
    certificate: certAddr,
    hashIndex,
    artifactHash,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(studentAddr, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(claimIx, m),
  );
  const partiallySigned =
    await partiallySignTransactionMessageWithSigners(message);

  return {
    wireTxBase64: getBase64EncodedWireTransaction(partiallySigned),
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight.toString(),
    studentWallet: onchainCert.student,
    imageUrl: stored.pngUrl,
    hash: artifact.sha256hex,
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export interface SubmitClaimInput {
  certificateAddress: string;
  callerWallets: string[];
  callerDid: string;
  /** The student-signed claim wire — required only when the cert isn't Claimed yet. A resume-mint re-POST (already Claimed, asset still null) omits it. */
  wireBytesBase64?: string;
  lastValidBlockHeight?: string;
}

export interface SubmitClaimResult {
  status: "claimed";
  certNumber: number;
  asset: string | null;
  imageUrl: string | null;
  claimSignature?: string;
  recordSignature?: string;
}

/**
 * The idempotent claim-submit pipeline (re-POSTable at any step; each step
 * checks chain state first): confirm the student-signed claim tx → mint the
 * soulbound Core asset (reusing a prior mint if one exists) → record_asset
 * (OPERATOR). A blockhash-expired/already-claimed re-POST is safe: if the cert
 * is already Claimed the confirm step is skipped; if the asset is already set
 * on-chain the mint+record steps are skipped.
 */
export async function submitClaim(
  input: SubmitClaimInput,
): Promise<SubmitClaimResult> {
  assertClaimReady();
  const rpc = getRpc();
  const certAddr = toAddress(input.certificateAddress);

  let onchainCert = await fetchCertificate(rpc, certAddr);
  if (!onchainCert) {
    fail("NOT_FOUND", "Certificado não encontrado on-chain.");
  }
  if (!input.callerWallets.includes(onchainCert.student)) {
    fail("FORBIDDEN", "Este certificado não pertence à sua conta.");
  }

  let claimSignature: string | undefined;

  // Step 1 — confirm the claim tx (skip if already Claimed).
  if (
    claimSubmitPlan({
      status: onchainCert.status,
      hasAsset: onchainCert.asset !== null,
    }).needsConfirm
  ) {
    if (onchainCert.status !== "FullySigned") {
      fail(
        "CERT_STATE_CONFLICT",
        "Este certificado não está no estado esperado para resgate.",
      );
    }
    if (!input.wireBytesBase64 || !input.lastValidBlockHeight) {
      fail("VALIDATION", "Transação de resgate ausente. Reinicie o resgate.");
    }
    const result = await submitAndSyncTransaction({
      wireBytesBase64: input.wireBytesBase64,
      lastValidBlockHeight: BigInt(input.lastValidBlockHeight),
      syncTargets: [
        { kind: "certificate", address: input.certificateAddress },
        { kind: "edition", address: onchainCert.edition },
      ],
      eventType: "certificate_claimed",
      actor: input.callerDid,
      certificateTxField: "claim_tx",
    });
    claimSignature = result.signature;
    await markCertificateClaimed(
      input.certificateAddress,
      new Date().toISOString(),
    );

    // Read-after-write: wait for the chain to reflect Claimed + cert_number.
    for (let i = 0; i < 8; i++) {
      const refreshed = await fetchCertificate(rpc, certAddr);
      if (refreshed && refreshed.status === "Claimed") {
        onchainCert = refreshed;
        break;
      }
      await sleep(1500);
    }
    if (onchainCert.status !== "Claimed") {
      fail("CHAIN_RPC_UNAVAILABLE", "Resgate confirmado, aguardando a rede.", {
        retryable: true,
      });
    }
  }

  const certNumber = Number(onchainCert.certNumber);

  // Step 2 — if the asset is already recorded on-chain, we're done. Reconcile
  // the mirror in case a prior record_asset synced on-chain but its mirror write
  // didn't — otherwise /me stays stuck at "Emitindo NFT…" despite chain being done.
  if (
    !claimSubmitPlan({
      status: onchainCert.status,
      hasAsset: onchainCert.asset !== null,
    }).needsMintAndRecord
  ) {
    await syncCertificateMirrorFromChain(input.certificateAddress, {
      status: onchainCert.status,
      signedMask: onchainCert.signedMask,
      certNumber: onchainCert.certNumber,
      asset: onchainCert.asset,
      artifactHash: onchainCert.artifactHash,
    });
    const cert = await getCertificateByAddress(input.certificateAddress);
    return {
      status: "claimed",
      certNumber,
      asset: onchainCert.asset,
      imageUrl: cert?.image_url ?? null,
      claimSignature,
    };
  }

  // Step 3 — mint the soulbound asset (idempotent) then record_asset.
  const cert = await getCertificateByAddress(input.certificateAddress);
  const edition = await getEditionByAddress(onchainCert.edition);
  if (!cert || !edition) {
    fail("NOT_FOUND", "Certificado ou edição não encontrados no espelho.");
  }

  const onchainEdition = await fetchEdition(rpc, onchainCert.edition);
  const editionId = onchainEdition ? onchainEdition.id.toString() : "0";
  const artifactShaHex = toHex(onchainCert.artifactHash);
  const metadataUri =
    cert.metadata_url ?? publicStorageUrl("metadata", `${artifactShaHex}.json`);

  const asset = await mintCertificateAsset({
    certificateAddress: input.certificateAddress,
    editionId,
    editionName: edition.name,
    certNumber,
    owner: onchainCert.student,
    artifactSha256Hex: artifactShaHex,
    verifyUrl: `${appUrl()}/verify/${input.certificateAddress}`,
    metadataUri,
  });

  const [configPda] = await findConfigPda();
  const operator = await getServerSigner("operator");
  const recordIx = getRecordAssetInstruction({
    config: configPda,
    certificate: certAddr,
    asset: toAddress(asset),
    adminSigners: [operator],
  });
  const signed = await signServerTx(recordIx, operator);
  const recorded = await submitAndSyncTransaction({
    wireBytesBase64: signed.wireBytesBase64,
    lastValidBlockHeight: signed.lastValidBlockHeight,
    syncTargets: [{ kind: "certificate", address: input.certificateAddress }],
    eventType: "certificate_asset_recorded",
    actor: input.callerDid,
    eventPayload: { asset },
  });

  return {
    status: "claimed",
    certNumber,
    asset,
    imageUrl: cert.image_url,
    claimSignature,
    recordSignature: recorded.signature,
  };
}
