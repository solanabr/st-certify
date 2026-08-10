/**
 * M1b E2E — the M1 demo: full happy path against the DEPLOYED devnet program,
 * driven entirely through @certify/client (its first integration exercise).
 *
 *   fund student -> create_edition (operator, +set Open) -> request_certificate
 *   (student) -> sign_certificate x2 (each edition signer) -> assert FullySigned
 *   -> claim_certificate (student + notary, artifact = sha256(fixture)) ->
 *   HashIndex round-trip -> mint a real soulbound Core asset (operator/deployer,
 *   owner = student) -> record_asset (operator) -> assert Claimed/#1/asset set.
 *
 * Fee payer = deployer everywhere; operator only signs. Prints every tx signature.
 */

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AccountRole,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  address,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  EditionStatus,
  PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  fetchCertificate,
  fetchConfig,
  fetchHashIndex,
  findCertPda,
  findConfigPda,
  findEditionPda,
  findHashIndexPda,
  getClaimCertificateInstruction,
  getCreateEditionInstruction,
  getRecordAssetInstruction,
  getRequestCertificateInstruction,
  getSetEditionStatusInstruction,
  getSignCertificateInstruction,
} from "@certify/client";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
  publicKey,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import {
  create,
  fetchAsset,
  fetchCollection,
  mplCore,
} from "@metaplex-foundation/mpl-core";

const ROOT = join(import.meta.dirname, "..");
const RPC_URL = envVar("NEXT_PUBLIC_RPC_URL", "https://api.devnet.solana.com");
const APP_URL = envVar(
  "NEXT_PUBLIC_APP_URL",
  "https://superteam.com.br/certify",
);
const COLLECTION = envVar("CORE_COLLECTION_ADDRESS");

const sigs: Array<[string, string]> = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const explorer = (s: string) =>
  `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const sha256 = (b: Uint8Array | string): Uint8Array =>
  new Uint8Array(createHash("sha256").update(b).digest());
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

function readSecret(name: string): Uint8Array {
  return Uint8Array.from(
    JSON.parse(readFileSync(join(ROOT, ".keys", `${name}.json`), "utf8")),
  );
}
function envVar(key: string, fallback = ""): string {
  const line = readFileSync(join(ROOT, ".env"), "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  const v = line?.slice(key.length + 1).trim();
  return v && v.length > 0 ? v : fallback;
}
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

type Rpc = ReturnType<typeof createSolanaRpc>;

async function send(
  rpc: Rpc,
  feePayer: TransactionSigner,
  ixs: Instruction[],
  label: string,
): Promise<string> {
  const { value: blockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const signed = await signTransactionMessageWithSigners(message);
  const sig = getSignatureFromTransaction(signed);
  try {
    await rpc
      .sendTransaction(getBase64EncodedWireTransaction(signed), {
        encoding: "base64",
        preflightCommitment: "confirmed",
        maxRetries: 5n,
      })
      .send();
  } catch (e) {
    const bigintSafe = (_k: string, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v;
    throw new Error(
      `${label} send failed: ${JSON.stringify((e as { context?: unknown }).context ?? String(e), bigintSafe)} :: ${String(e)}`,
    );
  }
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const st = value[0];
    if (st?.err)
      throw new Error(`${label} failed on-chain: ${JSON.stringify(st.err)}`);
    if (
      st &&
      (st.confirmationStatus === "confirmed" ||
        st.confirmationStatus === "finalized")
    ) {
      sigs.push([label, sig]);
      console.log(`   ${label}: ${explorer(sig)}`);
      return sig;
    }
  }
  throw new Error(`${label}: not confirmed (sig ${sig})`);
}

function transferSol(
  from: TransactionSigner,
  to: Address,
  lamports: bigint,
): Instruction {
  const data = new Uint8Array(12);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, 2, true); // System Program Transfer discriminator
  dv.setBigUint64(4, lamports, true);
  return {
    programAddress: SYSTEM_PROGRAM_ID,
    accounts: [
      {
        address: from.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: from,
      },
      { address: to, role: AccountRole.WRITABLE },
    ],
    data,
  };
}

async function retry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 8,
  delayMs = 1500,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw new Error(`${label}: gave up after ${attempts} — ${String(last)}`);
}

function makeUmi() {
  const umi = createUmi(RPC_URL).use(mplCore());
  const operatorKp = umi.eddsa.createKeypairFromSecretKey(
    readSecret("operator"),
  );
  const deployerKp = umi.eddsa.createKeypairFromSecretKey(
    readSecret("deployer"),
  );
  umi.use(keypairIdentity(operatorKp, false));
  umi.payer = createSignerFromKeypair(umi, deployerKp);
  return umi;
}

async function main(): Promise<void> {
  assert(
    COLLECTION.length > 0,
    "CORE_COLLECTION_ADDRESS missing — run seed first",
  );
  const rpc = createSolanaRpc(RPC_URL);

  const deployer = await createKeyPairSignerFromBytes(readSecret("deployer"));
  const operator = await createKeyPairSignerFromBytes(readSecret("operator"));
  const notary = await createKeyPairSignerFromBytes(readSecret("notary"));
  const student = await generateKeyPairSigner();
  const signer1 = await generateKeyPairSigner();
  const signer2 = await generateKeyPairSigner();

  console.log("== Certify E2E (devnet) ==");
  console.log(`   program=${PROGRAM_ID} collection=${COLLECTION}`);
  console.log(
    `   student=${student.address} signers=[${signer1.address}, ${signer2.address}]\n`,
  );

  // 0) fund the throwaway student from the deployer -------------------------
  console.log("[0] fund student (0.02 SOL)");
  await send(
    rpc,
    deployer,
    [transferSol(deployer, student.address, 20_000_000n)],
    "fund_student",
  );

  // 1) create_edition (operator) + set Open --------------------------------
  const [config] = await findConfigPda();
  const cfg = await fetchConfig(rpc, config);
  assert(cfg, "config not found — run seed");
  const editionId = cfg!.editionsCreated;
  const [edition] = await findEditionPda(editionId);
  const editionName = "Certify E2E Devnet";
  console.log(
    `\n[1] create_edition id=${editionId} -> ${edition}, then set Open`,
  );
  await send(
    rpc,
    deployer,
    [
      getCreateEditionInstruction({
        payer: deployer,
        config,
        edition,
        name: editionName,
        specHash: sha256("spec:certify-e2e"),
        maxSupply: 0n,
        signers: [
          {
            pubkey: signer1.address,
            name: "Ana Instrutora",
            role: "Instrutora",
          },
          { pubkey: signer2.address, name: "Bruno Diretor", role: "Diretor" },
        ],
        adminSigners: [operator],
      }),
      getSetEditionStatusInstruction({
        config,
        edition,
        status: EditionStatus.Open,
        adminSigners: [operator],
      }),
    ],
    "create_edition+open",
  );

  // 2) request_certificate (student) ---------------------------------------
  const [cert] = await findCertPda(edition, student.address);
  const salt = new Uint8Array(randomBytes(32));
  const nameCommitment = sha256(
    new Uint8Array([...salt, ...new TextEncoder().encode("Estudante Demo")]),
  );
  console.log(`\n[2] request_certificate -> ${cert}`);
  await send(
    rpc,
    deployer,
    [
      getRequestCertificateInstruction({
        student,
        edition,
        certificate: cert,
        nameCommitment,
      }),
    ],
    "request_certificate",
  );

  // 3) sign_certificate x2 --------------------------------------------------
  console.log("\n[3] sign_certificate x2 (each edition signer)");
  await send(
    rpc,
    deployer,
    [
      getSignCertificateInstruction({
        signer: signer1,
        edition,
        certificate: cert,
      }),
    ],
    "sign_1",
  );
  await send(
    rpc,
    deployer,
    [
      getSignCertificateInstruction({
        signer: signer2,
        edition,
        certificate: cert,
      }),
    ],
    "sign_2",
  );

  const afterSign = await retry(
    () =>
      fetchCertificate(rpc, cert).then((c) => {
        if (!c) throw new Error("cert not visible yet");
        return c;
      }),
    "fetch cert after sign",
  );
  assert(
    afterSign.status === "FullySigned",
    `expected FullySigned, got ${afterSign.status}`,
  );
  assert(
    afterSign.signedMask === 0b11,
    `expected mask 0b11, got ${afterSign.signedMask}`,
  );
  console.log(
    `   -> status=${afterSign.status} mask=${afterSign.signedMask.toString(2)} ✓`,
  );

  // 4) claim_certificate (student + notary) --------------------------------
  // Unique artifact per run: a fixed fixed-hash would collide with the HashIndex
  // created by a previous run (the program's squat/duplicate-artifact guard).
  const artifact = Buffer.concat([
    Buffer.from("certify-e2e-demo-artifact-png-bytes"),
    randomBytes(16),
  ]);
  const artifactHash = sha256(artifact);
  const [hashIndex] = await findHashIndexPda(artifactHash);
  console.log(
    `\n[4] claim_certificate (artifact_sha256=${hex(artifactHash).slice(0, 16)}…) hashIndex=${hashIndex}`,
  );
  await send(
    rpc,
    deployer,
    [
      getClaimCertificateInstruction({
        student,
        notary,
        config,
        edition,
        certificate: cert,
        hashIndex,
        artifactHash,
      }),
    ],
    "claim_certificate",
  );

  // 5) HashIndex round-trip -------------------------------------------------
  const hi = await retry(
    () =>
      fetchHashIndex(rpc, hashIndex).then((h) => {
        if (!h) throw new Error("hashindex not visible yet");
        return h;
      }),
    "fetch hashindex",
  );
  assert(
    hi.certificate === cert,
    `HashIndex.certificate ${hi.certificate} != ${cert}`,
  );
  const claimed = await retry(
    () =>
      fetchCertificate(rpc, cert).then((c) => {
        if (!c) throw new Error("cert not visible yet");
        return c;
      }),
    "fetch cert after claim",
  );
  assert(
    claimed.status === "Claimed",
    `expected Claimed, got ${claimed.status}`,
  );
  assert(
    claimed.certNumber === 1n,
    `expected cert_number 1, got ${claimed.certNumber}`,
  );
  assert(
    hex(claimed.artifactHash) === hex(artifactHash),
    "artifact_hash mismatch",
  );
  console.log(
    `   -> HashIndex→cert ok; status=Claimed cert_number=${claimed.certNumber} ✓`,
  );

  // 6) mint the soulbound Core asset (operator/deployer, owner = student) ---
  console.log("\n[6] mint soulbound Core asset (freeze + burn delegate)");
  const umi = makeUmi();
  const collection = await retry(
    () => fetchCollection(umi, publicKey(COLLECTION)),
    "fetch collection",
  );
  const assetSigner = generateSigner(umi);
  const mintRes = await create(umi, {
    asset: assetSigner,
    collection,
    owner: publicKey(student.address),
    name: `${editionName} #${claimed.certNumber}`,
    uri: `${APP_URL}/metadata/${hex(artifactHash)}.json`,
    plugins: [
      {
        type: "PermanentFreezeDelegate",
        frozen: true,
        authority: { type: "None" },
      },
      {
        type: "PermanentBurnDelegate",
        authority: { type: "Address", address: umi.identity.publicKey },
      },
      {
        type: "Attributes",
        attributeList: [
          { key: "cert_pda", value: cert },
          { key: "cert_number", value: String(claimed.certNumber) },
          { key: "artifact_sha256", value: hex(artifactHash) },
          { key: "verify_url", value: `${APP_URL}/verify/${cert}` },
        ],
      },
    ],
  }).sendAndConfirm(umi);
  const assetAddress = assetSigner.publicKey.toString();
  await retry(
    () => fetchAsset(umi, assetSigner.publicKey),
    "confirm asset visible",
  );
  const mintSig = base58.deserialize(mintRes.signature)[0];
  sigs.push(["mint_asset", mintSig]);
  console.log(`   asset=${assetAddress} owner=${student.address}`);
  console.log(`   mint_asset: ${explorer(mintSig)}`);

  // 7) record_asset (operator) ---------------------------------------------
  console.log("\n[7] record_asset (operator)");
  await send(
    rpc,
    deployer,
    [
      getRecordAssetInstruction({
        config,
        certificate: cert,
        asset: address(assetAddress),
        adminSigners: [operator],
      }),
    ],
    "record_asset",
  );

  // 8) final assertion ------------------------------------------------------
  const final = await retry(
    () =>
      fetchCertificate(rpc, cert).then((c) => {
        if (!c) throw new Error("cert not visible yet");
        return c;
      }),
    "fetch final cert",
  );
  assert(final.status === "Claimed", `final status ${final.status}`);
  assert(final.certNumber === 1n, `final cert_number ${final.certNumber}`);
  assert(
    final.asset === assetAddress,
    `final asset ${final.asset} != ${assetAddress}`,
  );

  console.log("\n== FINAL certificate (decoded via @certify/client) ==");
  console.log(
    `   status=${final.status} cert_number=${final.certNumber} isPartiallySigned=${final.isPartiallySigned}`,
  );
  console.log(`   edition=${final.edition} student=${final.student}`);
  console.log(`   asset=${final.asset}`);
  console.log(
    `   sig_timestamps=[${final.sigTimestamps.slice(0, 2).join(", ")}, …] claimed_at=${final.claimedAt}`,
  );

  console.log("\n== E2E PASS — all assertions green ==");
  console.log(`   ${sigs.length} transactions:`);
  for (const [label, s] of sigs) console.log(`   - ${label}: ${s}`);
}

main().catch((e) => {
  console.error("\nE2E FAILED:", e);
  process.exit(1);
});
