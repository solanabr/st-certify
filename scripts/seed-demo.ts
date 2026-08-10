/**
 * M7 seed-demo — creates ONE permanent, idempotent demo edition ("Solana
 * Bootcamp — Turma 2026") with certificates in every dashboard/verify state
 * (requested, partially-signed, fully-signed, claimed, revoked), so the
 * whole app is demoable the moment Supabase is wired up.
 *
 * Needs: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (writes the
 * mirror directly with the service-role client — same pattern as
 * scripts/rls-probe.ts — rather than importing apps/web's server-only
 * modules) and the already-deployed devnet program + Core collection
 * (`pnpm seed:onchain` must have run first). Reuses scripts/e2e-devnet.ts's
 * proven send/transferSol/retry/makeUmi helpers instead of re-deriving them.
 *
 * Idempotent: keyed on a fixed edition slug. A second run detects the
 * existing edition in the DB mirror and exits without creating anything.
 * A partial-failure re-run (crashed mid-way) may leave an orphaned on-chain
 * Edition PDA (~0.0056 SOL rent, never referenced by anything) since the
 * on-chain id counter already advanced past it — an accepted devnet-only
 * tradeoff, not safe to assume on mainnet.
 *
 * The two signer wallets are the OPERATOR key (already held by this script)
 * plus one freshly generated throwaway "guest instructor" key, per the
 * brief's suggestion — deliberately NOT any real Superteam staff member's
 * name, since a signer's name is permanently pinned into spec_hash and
 * showing a real person's name next to a wallet nobody actually controls
 * would be misleading, not just cosmetically wrong.
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
  SYSTEM_PROGRAM_ID,
  fetchCertificate,
  fetchConfig,
  findCertPda,
  findConfigPda,
  findEditionPda,
  findHashIndexPda,
  getClaimCertificateInstruction,
  getCreateEditionInstruction,
  getRecordAssetInstruction,
  getRequestCertificateInstruction,
  getRevokeCertificateInstruction,
  getSetEditionStatusInstruction,
  getSignCertificateInstruction,
} from "@certify/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
const EDITION_SLUG = "solana-bootcamp-turma-2026";
const EDITION_NAME = "Solana Bootcamp — Turma 2026";
const TEMPLATE_PATH = join(
  ROOT,
  "apps/web/assets/templates/default-superteam-br.png",
);

// ---------------------------------------------------------------------------
// Shared helpers (same shape as scripts/e2e-devnet.ts — kept independent
// rather than imported so this script has no fragile cross-script coupling).
// ---------------------------------------------------------------------------

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
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      preflightCommitment: "confirmed",
      maxRetries: 5n,
    })
    .send();
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
  const umi = createUmi(
    envVar("NEXT_PUBLIC_RPC_URL", "https://api.devnet.solana.com"),
  ).use(mplCore());
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

// ---------------------------------------------------------------------------
// Demo student roster — the 5 states the brief asks for. Fictional names,
// deliberately not resembling any real Superteam student or staff member.
// ---------------------------------------------------------------------------

type Target = "requested" | "partial" | "fully-signed" | "claimed" | "revoked";

const DEMO_STUDENTS: Array<{ name: string; target: Target }> = [
  { name: "Ana Beatriz Souza", target: "requested" },
  { name: "Carlos Eduardo Lima", target: "partial" },
  { name: "Fernanda Oliveira Costa", target: "fully-signed" },
  { name: "Gabriel Henrique Alves", target: "claimed" },
  { name: "Isabela Martins Rocha", target: "revoked" },
];

interface DemoSummaryRow {
  name: string;
  target: Target;
  status: string;
  address: string;
}

async function printExistingSummary(
  db: SupabaseClient,
  editionAddress: string,
  appUrl: string,
): Promise<void> {
  const { data, error } = await db
    .from("certificates")
    .select("address, student_name, status")
    .eq("edition_address", editionAddress)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn(`   (could not list existing certificates: ${error.message})`);
    return;
  }
  console.log("\n== Existing demo certificates ==");
  for (const c of data ?? []) {
    console.log(
      `   ${(c as { student_name: string }).student_name.padEnd(24)} ${(c as { status: string }).status.padEnd(14)} ${appUrl}/verify/${(c as { address: string }).address}`,
    );
  }
}

async function main(): Promise<void> {
  const url = envVar("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envVar("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.log("skipped — set NEXT_PUBLIC_SUPABASE_URL");
    return;
  }

  const appUrl = envVar(
    "NEXT_PUBLIC_APP_URL",
    "https://superteam.com.br/certify",
  );
  const rpcUrl = envVar("NEXT_PUBLIC_RPC_URL", "https://api.devnet.solana.com");
  const collectionAddress = envVar("CORE_COLLECTION_ADDRESS");
  if (!collectionAddress) {
    throw new Error(
      "CORE_COLLECTION_ADDRESS missing in .env — run `pnpm seed:onchain` first.",
    );
  }

  const db: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // -------------------------------------------------------------------
  // Idempotency gate
  // -------------------------------------------------------------------
  const { data: existing, error: existingErr } = await db
    .from("editions")
    .select("address")
    .eq("slug", EDITION_SLUG)
    .maybeSingle();
  if (existingErr) {
    throw new Error(
      `checking for existing demo edition: ${existingErr.message}`,
    );
  }
  if (existing) {
    const editionAddress = (existing as { address: string }).address;
    console.log(
      `Demo edition already exists (${editionAddress}) — idempotent no-op.`,
    );
    await printExistingSummary(db, editionAddress, appUrl);
    return;
  }

  const rpc = createSolanaRpc(rpcUrl);
  const deployer = await createKeyPairSignerFromBytes(readSecret("deployer"));
  const operator = await createKeyPairSignerFromBytes(readSecret("operator"));
  const notary = await createKeyPairSignerFromBytes(readSecret("notary"));
  const guestSigner = await generateKeyPairSigner();

  console.log("== Certify demo seed ==");
  console.log(`   edition: "${EDITION_NAME}" (${EDITION_SLUG})`);
  console.log(
    `   signers: operator=${operator.address}  guest=${guestSigner.address}\n`,
  );

  // -------------------------------------------------------------------
  // create_edition (operator) + set Open
  // -------------------------------------------------------------------
  const [config] = await findConfigPda();
  const cfg = await fetchConfig(rpc, config);
  if (!cfg) {
    throw new Error(
      "Config not found on-chain — run `pnpm seed:onchain` first.",
    );
  }
  const editionId = cfg.editionsCreated;
  const [edition] = await findEditionPda(editionId);
  const specHash = sha256(`spec:certify-demo-seed-v1:${EDITION_SLUG}`);

  console.log(
    `[1] create_edition id=${editionId} -> ${edition}, then set Open`,
  );
  await send(
    rpc,
    deployer,
    [
      getCreateEditionInstruction({
        payer: operator,
        config,
        edition,
        name: EDITION_NAME,
        specHash,
        maxSupply: 100n,
        signers: [
          {
            pubkey: operator.address,
            name: "Equipe Superteam Brasil",
            role: "Organização",
          },
          {
            pubkey: guestSigner.address,
            name: "Convidado(a) Demo",
            role: "Instrutor(a)",
          },
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

  const templateBytes = readFileSync(TEMPLATE_PATH);
  const templateSha256Hex = hex(sha256(templateBytes));

  // DB: edition + signers mirror (matches lib/db/mutations.ts's
  // insertEditionMirror/insertEditionSigners column shapes exactly, though
  // written directly here rather than imported — that module is
  // `server-only` and this is a bare-Node script, not a Next.js server).
  {
    const { error } = await db.from("editions").insert({
      address: edition,
      slug: EDITION_SLUG,
      name: EDITION_NAME,
      description:
        "Dados de demonstração gerados por scripts/seed-demo.ts — não passou pelo assistente de criação.",
      template_sha256: templateSha256Hex,
      layout: {
        seed: true,
        note: "synthetic demo edition — not produced by the admin wizard",
      },
      spec_hash: hex(specHash),
      max_supply: 100,
      minted: 0,
      requested: 0,
      closed: 0,
      status: "Open",
      completion_date: new Date().toISOString().slice(0, 10),
      tx_sig: null,
    });
    if (error) throw new Error(`DB editions insert: ${error.message}`);
  }
  {
    const { error } = await db.from("edition_signers").insert([
      {
        edition_address: edition,
        position: 0,
        wallet: operator.address,
        name: "Equipe Superteam Brasil",
        role: "Organização",
      },
      {
        edition_address: edition,
        position: 1,
        wallet: guestSigner.address,
        name: "Convidado(a) Demo",
        role: "Instrutor(a)",
      },
    ]);
    if (error) throw new Error(`DB edition_signers insert: ${error.message}`);
  }
  console.log("   edition + signers mirrored.\n");

  // -------------------------------------------------------------------
  // 5 demo certificates, one per target state.
  // -------------------------------------------------------------------
  const summary: DemoSummaryRow[] = [];

  for (const demo of DEMO_STUDENTS) {
    console.log(`[*] ${demo.name} -> ${demo.target}`);
    const student = await generateKeyPairSigner();
    await send(
      rpc,
      deployer,
      [transferSol(deployer, student.address, 20_000_000n)],
      `fund (${demo.target})`,
    );

    const [cert] = await findCertPda(edition, student.address);
    const salt = new Uint8Array(randomBytes(32));
    const nameCommitment = sha256(
      new Uint8Array([...salt, ...new TextEncoder().encode(demo.name)]),
    );

    // Pending DB row BEFORE the on-chain tx — mirrors the real app's
    // prepare-request ordering (plaintext name lands off-chain first).
    {
      const { error } = await db.from("certificates").insert({
        address: cert,
        edition_address: edition,
        owner_wallet: student.address,
        owner_did: null,
        student_name: demo.name,
        name_salt: hex(salt),
        status: "Requested",
        signer_bitmap: 0,
      });
      if (error) {
        throw new Error(
          `DB pending cert insert (${demo.name}): ${error.message}`,
        );
      }
    }

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
      `request (${demo.target})`,
    );

    let bitmap = 0;
    let status = "Requested";

    if (demo.target !== "requested") {
      await send(
        rpc,
        deployer,
        [
          getSignCertificateInstruction({
            signer: operator,
            edition,
            certificate: cert,
          }),
        ],
        `sign operator (${demo.target})`,
      );
      bitmap |= 0b01;
    }
    if (
      demo.target === "fully-signed" ||
      demo.target === "claimed" ||
      demo.target === "revoked"
    ) {
      await send(
        rpc,
        deployer,
        [
          getSignCertificateInstruction({
            signer: guestSigner,
            edition,
            certificate: cert,
          }),
        ],
        `sign guest (${demo.target})`,
      );
      bitmap |= 0b10;
      status = "FullySigned";
    }

    {
      const { error } = await db
        .from("certificates")
        .update({
          status,
          signer_bitmap: bitmap,
          updated_at: new Date().toISOString(),
        })
        .eq("address", cert);
      if (error)
        throw new Error(`DB sign sync (${demo.name}): ${error.message}`);
    }

    if (demo.target === "claimed" || demo.target === "revoked") {
      // Unique artifact per cert (the program rejects a duplicate
      // artifact_hash — HashIndex is `init`, never `init_if_needed`): the
      // real default template's bytes plus a small trailing marker.
      // Trailing bytes after PNG's IEND are ignored by every mainstream
      // renderer, so the uploaded image still displays correctly while the
      // hash stays unique per demo certificate.
      const artifactBytes = Buffer.concat([
        templateBytes,
        Buffer.from(`\n<!--certify-demo:${demo.target}:${student.address}-->`),
      ]);
      const artifactHash = sha256(artifactBytes);
      const [hashIndex] = await findHashIndexPda(artifactHash);

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
        `claim (${demo.target})`,
      );

      const claimed = await retry(
        () =>
          fetchCertificate(rpc, cert).then(
            (c) => c ?? Promise.reject(new Error("cert not visible yet")),
          ),
        "fetch cert after claim",
      );

      let imageUrl: string | null = null;
      try {
        const path = `${hex(artifactHash)}.png`;
        const { error: upErr } = await db.storage
          .from("certs")
          .upload(path, artifactBytes, {
            contentType: "image/png",
            upsert: true,
          });
        if (upErr) throw upErr;
        imageUrl = db.storage.from("certs").getPublicUrl(path).data.publicUrl;
      } catch (e) {
        console.warn(
          `   (image upload skipped — bucket likely not set up yet, run \`pnpm setup:supabase\`: ${String(e)})`,
        );
      }

      console.log(`   mint soulbound Core asset (cert #${claimed.certNumber})`);
      const umi = makeUmi();
      const collection = await retry(
        () => fetchCollection(umi, publicKey(collectionAddress)),
        "fetch collection",
      );
      const assetSigner = generateSigner(umi);
      const mintRes = await create(umi, {
        asset: assetSigner,
        collection,
        owner: publicKey(student.address),
        name: `${EDITION_NAME} #${claimed.certNumber}`,
        uri: `${appUrl}/metadata/${hex(artifactHash)}.json`,
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
              { key: "verify_url", value: `${appUrl}/verify/${cert}` },
            ],
          },
        ],
      }).sendAndConfirm(umi);
      const assetAddress = assetSigner.publicKey.toString();
      await retry(
        () => fetchAsset(umi, assetSigner.publicKey),
        "confirm asset visible",
      );
      console.log(
        `   mint_asset: ${explorer(base58.deserialize(mintRes.signature)[0])}`,
      );

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
        `record_asset (${demo.target})`,
      );

      status = "Claimed";
      {
        const { error } = await db
          .from("certificates")
          .update({
            status: "Claimed",
            signer_bitmap: bitmap,
            cert_number: Number(claimed.certNumber),
            asset: assetAddress,
            sha256: hex(artifactHash),
            image_url: imageUrl,
            completed_at: new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          })
          .eq("address", cert);
        if (error)
          throw new Error(`DB claim sync (${demo.name}): ${error.message}`);
      }

      if (demo.target === "revoked") {
        const reason =
          "Demonstração — revogado propositalmente para exibir o estado REVOGADO na página de verificação.";
        await send(
          rpc,
          deployer,
          [
            getRevokeCertificateInstruction({
              config,
              certificate: cert,
              adminSigners: [deployer, operator],
            }),
          ],
          "revoke",
        );
        status = "Revoked";
        {
          const { error } = await db
            .from("certificates")
            .update({
              status: "Revoked",
              revoke_reason: reason,
              updated_at: new Date().toISOString(),
            })
            .eq("address", cert);
          if (error)
            throw new Error(`DB revoke sync (${demo.name}): ${error.message}`);
        }
      }
    }

    summary.push({
      name: demo.name,
      target: demo.target,
      status,
      address: cert,
    });
    console.log("");
  }

  // -------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------
  console.log("== Demo seed complete ==");
  console.log(`   Edition: ${appUrl}/editions/${EDITION_SLUG}\n`);
  for (const row of summary) {
    console.log(
      `   ${row.name.padEnd(24)} ${row.status.padEnd(14)} ${appUrl}/verify/${row.address}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error("\nseed-demo FAILED:", error);
  process.exitCode = 1;
});
