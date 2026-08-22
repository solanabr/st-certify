/**
 * Overhaul E2E (devnet) — the wizard-era happy path, end to end, against the
 * DEPLOYED devnet program and the LIVE Supabase mirror:
 *
 *   draft -> signer invites (both accepted) -> create-onchain -> request x2 ->
 *   batch sign (2 ixs per signer tx) -> claim (+ soulbound Core asset) ->
 *   GET /api/certificates/[addr]/pdf
 *
 * The closing assertion is what makes this worth running: the exported PDF must
 * start with `%PDF-` AND carry, in its XMP packet, the same artifact sha256
 * that was committed on-chain by `claim_certificate` and stored as the
 * certificate PNG in the `certs` bucket. Three independent copies of one hash —
 * chain, storage, document — proven equal in a single pass. Anything that
 * silently re-renders, re-hashes or mis-mirrors the artifact breaks here: the
 * artifact is produced by the app's OWN renderer from the claim pipeline's own
 * inputs, and the export re-runs that renderer and refuses to print anything
 * that comes out different.
 *
 * Conventions (same as scripts/e2e-devnet.ts and scripts/seed-demo.ts):
 *   - chain writes go through @certify/client; the mirror is written directly
 *     with the SERVICE-ROLE client. apps/web's data layer is `server-only` and
 *     lives behind the `@/` path alias, so it cannot be imported from a bare
 *     Node script — the column shapes here mirror lib/db/mutations.ts and
 *     lib/db/draft-mutations.ts by hand, exactly as seed-demo.ts does.
 *   - app modules whose output has to agree byte-for-byte with the server's are
 *     imported by relative path rather than copied: `layout.ts` (canonical
 *     layout + spec hash input), `verify-code.ts`, and `render/render.ts` (the
 *     artifact itself — see the registerHooks block below for what importing a
 *     `server-only` module from bare Node takes). A divergent copy of any of
 *     them would make the mirror disagree with the chain, the printed code
 *     disagree with the lookup, or the document disagree with its own hash —
 *     the precise failures this script exists to catch.
 *   - keypairs come from .keys/{deployer,operator,notary}.json; the deployer
 *     is the fee payer everywhere and funds the throwaway student wallets by
 *     transfer, never by faucet airdrop (devnet's faucet rate-limits hard and
 *     a run needs several funded wallets).
 *
 * Needs a running app for the PDF hop: E2E_BASE_URL (default
 * http://localhost:3000). That server must NOT be in UI-mock mode — fixtures
 * would answer the PDF request for a certificate this script never created,
 * so the preflight refuses to run against one.
 *
 * The Supabase project is production. Everything written here is namespaced by
 * a run id and removed in a `finally` block (same discipline as
 * scripts/rls-probe.ts); pass `--keep` to leave the rows behind for debugging.
 * The on-chain side is permanent — an Edition PDA, two Certificate PDAs, a
 * HashIndex and one Core asset per run, a few thousandths of a SOL of devnet
 * rent that nothing else references. That is the accepted devnet tradeoff
 * seed-demo.ts documents; it is NOT safe to assume on mainnet.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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

import {
  canonicalizeLayout,
  editionReadyLayoutSchema,
  type Layout,
} from "../apps/web/lib/render/layout";
import { verifyCode } from "../apps/web/lib/verify-code";
import type {
  RenderCertificateInput,
  RenderCertificateResult,
} from "../apps/web/lib/render/render";

const ROOT = join(import.meta.dirname, "..");
const WEB = join(ROOT, "apps/web");

try {
  process.loadEnvFile(join(ROOT, ".env"));
} catch {
  // No .env found — assume the environment is already configured.
}

// The renderer is the third module borrowed from apps/web, and the only one
// that is `server-only` — it is imported anyway, because a lookalike would
// defeat the point of this script: the hash it produces is what goes on-chain,
// into storage and into the exported PDF, and the PDF route now refuses to
// export a certificate it cannot re-render to the same hash. Two things a Next
// server gives it for free are arranged here instead:
//
//   - `server-only` throws unless the `react-server` export condition is
//     active. registerHooks points that one specifier at the package's own
//     empty module — the same substitution apps/web/vitest.config.ts makes with
//     a Vite alias.
//   - the fonts are read from `process.cwd()/assets/fonts`, resolved when the
//     module is evaluated, so apps/web has to be the working directory by then.
//
// Everything else in this file addresses files through ROOT, so the chdir is
// invisible to it. Both must precede the import, which is why it is dynamic
// (`renderCanonicalArtifact` below) — a static one would be hoisted above them.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") {
      return {
        url: pathToFileURL(join(WEB, "node_modules/server-only/empty.js")).href,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});
process.chdir(WEB);

const TEMPLATE_PATH = join(WEB, "assets/templates/default-superteam-br.png");
const DEFAULT_LAYOUT_PATH = join(WEB, "assets/templates/default-layout.json");

/** Marks every row this run writes to the shared project. */
const RUN_ID = `e2eoverhaul_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const KEEP = process.argv.includes("--keep");

/** The locale the PDF is requested in — pinned so the cache path is known for cleanup. */
const PDF_LOCALE = "pt-BR";

const sigs: Array<[string, string]> = [];
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
const explorer = (s: string): string =>
  `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const sha256 = (b: Uint8Array | string): Uint8Array =>
  new Uint8Array(createHash("sha256").update(b).digest());
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

function readSecret(name: string): Uint8Array {
  return Uint8Array.from(
    JSON.parse(readFileSync(join(ROOT, ".keys", `${name}.json`), "utf8")),
  );
}

let renderer:
  ((i: RenderCertificateInput) => Promise<RenderCertificateResult>) | null =
  null;

/**
 * The canonical artifact, rendered by the app's own renderer (see the
 * registerHooks block above for why the import is dynamic).
 */
async function renderCanonicalArtifact(
  input: RenderCertificateInput,
): Promise<RenderCertificateResult> {
  renderer ??= (await import(join(WEB, "lib/render/render.ts")))
    .renderCertificate;
  return renderer(input);
}

/**
 * Mirrors apps/web/lib/chain/claim.ts#appUrl — the base of the verify URL that
 * gets rendered into the QR, and therefore an input to the artifact hash. If
 * this disagrees with the running server's value the PDF hop fails on purpose:
 * that mismatch is exactly the drift the export's integrity check exists for.
 */
function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Mirrors apps/web/lib/chain/claim.ts#certDateText. */
function certDateText(completionDate: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(completionDate));
}

/** Mirrors apps/web/lib/chain/rpc.ts#resolveRpcUrl — Helius when keyed, else the public URL. */
function resolveRpcUrl(): string {
  const heliusKey = process.env.HELIUS_API_KEY;
  const publicUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "";
  if (!heliusKey) return publicUrl || "https://api.devnet.solana.com";
  const cluster =
    publicUrl === "" || publicUrl.includes("devnet") ? "devnet" : "mainnet";
  return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
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
    const bigintSafe = (_k: string, v: unknown): unknown =>
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

/** Read-after-write backoff for devnet RPC (same shape as e2e-devnet.ts#retry). */
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

function makeUmi(rpcUrl: string) {
  const umi = createUmi(rpcUrl).use(mplCore());
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

/**
 * Hand-synced with `autoSignatureBoxes` in apps/web/lib/editions/create.ts —
 * that module is `server-only`, so this is the one piece of the wizard's
 * layout assembly that has to be duplicated rather than imported. The numbers
 * matter only in that they must stay inside the default template's safe band
 * (the QR sits at x >= 0.8813); the assertion this script makes does not
 * depend on them.
 */
function autoSignatureBoxes(count: number): Layout["signatures"] {
  const marginX = 0.06;
  const rightBound = 0.85;
  const gapX = 0.02;
  const boxW = (rightBound - marginX - gapX * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: marginX + i * (boxW + gapX),
    y: 0.725,
    w: boxW,
    h: 0.1415,
    align: "center" as const,
  }));
}

interface SeatBinding {
  name: string;
  role: string;
  email: string;
  signer: TransactionSigner;
}

// ---------------------------------------------------------------------------
// Preflight — every precondition, checked before anything is written.
// ---------------------------------------------------------------------------

interface Preflight {
  baseUrl: string;
  db: SupabaseClient;
  rpcUrl: string;
  collection: string;
}

async function preflight(): Promise<Preflight> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const collection = process.env.CORE_COLLECTION_ADDRESS;
  const missing = (
    [
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
      ["CORE_COLLECTION_ADDRESS", collection],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([n]) => n);
  if (missing.length > 0) {
    throw new Error(
      `missing required env: ${missing.join(", ")} — see .env.example`,
    );
  }

  const baseUrl = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  // A UI-mock server answers every read from fixtures, so the PDF hop would
  // "pass" against a certificate this run never created. Refuse rather than
  // report a green that means nothing.
  const meRes = await fetch(`${baseUrl}/api/me`).catch((e: unknown) => {
    throw new Error(
      `E2E_BASE_URL ${baseUrl} unreachable (${String(e)}) — start the app with \`pnpm dev\` (UI mock OFF) or point E2E_BASE_URL at a real deployment.`,
    );
  });
  const me = (await meRes.json().catch(() => ({}))) as { did?: string };
  assert(
    !me.did?.includes("cmock"),
    `${baseUrl} is running in UI-mock mode (NEXT_PUBLIC_UI_MOCK=1) — its PDF route serves fixtures, not this run's certificate. Restart it without the flag.`,
  );

  return {
    baseUrl,
    db: createClient(url as string, serviceKey as string, {
      auth: { persistSession: false },
    }),
    rpcUrl: resolveRpcUrl(),
    collection: collection as string,
  };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { baseUrl, db, rpcUrl, collection } = await preflight();
  const rpc = createSolanaRpc(rpcUrl);

  const deployer = await createKeyPairSignerFromBytes(readSecret("deployer"));
  const operator = await createKeyPairSignerFromBytes(readSecret("operator"));
  const notary = await createKeyPairSignerFromBytes(readSecret("notary"));

  const slug = `e2e-overhaul-${RUN_ID}`;
  const editionName = `E2E Overhaul ${RUN_ID}`;
  const createdBy = `did:privy:${RUN_ID}`;

  console.log("== Certify overhaul E2E (devnet) ==");
  console.log(`   run=${RUN_ID}`);
  console.log(`   program=${PROGRAM_ID} collection=${collection}`);
  console.log(`   app=${baseUrl}\n`);

  let draftId: string | null = null;
  let editionAddress: string | null = null;
  let artifactHashHex: string | null = null;

  try {
    // -------------------------------------------------------------------
    // [1] draft — what the wizard's step-1 autosave creates.
    // -------------------------------------------------------------------
    console.log("[1] draft (edition_drafts)");
    const meta = {
      name: editionName,
      slug,
      description:
        "Execução descartável de scripts/e2e-overhaul-devnet.ts — removida ao final do teste.",
      maxSupply: 10,
      completionDate: new Date().toISOString().slice(0, 10),
    };
    {
      const { data, error } = await db
        .from("edition_drafts")
        .insert({ meta, created_by: createdBy })
        .select("id")
        .single();
      if (error || !data)
        throw new Error(`draft insert: ${error?.message ?? "no row"}`);
      draftId = (data as { id: string }).id;
    }
    console.log(`   draft=${draftId} slug=${slug}`);

    // -------------------------------------------------------------------
    // [2] signer invites — seats created, then bound to wallets.
    //
    // The acceptance is a DIRECT DB write on purpose: the `/invite/[token]`
    // token exchange is covered by unit tests, and driving it here would need
    // a Privy session this script has no way to mint. What IS exercised is the
    // property the chain step depends on — the single-use UPDATE that
    // draft-mutations.ts#acceptInvite arbitrates in Postgres, re-run here to
    // prove a second accept binds nothing.
    // -------------------------------------------------------------------
    console.log("\n[2] signer invites (2 seats) + accept");
    const seats: SeatBinding[] = [
      {
        name: "Ana Instrutora",
        role: "Instrutora",
        email: `ana+${RUN_ID}@example.invalid`,
        signer: await generateKeyPairSigner(),
      },
      {
        name: "Bruno Diretor",
        role: "Diretor",
        email: `bruno+${RUN_ID}@example.invalid`,
        signer: await generateKeyPairSigner(),
      },
    ];

    const inviteIds: string[] = [];
    {
      const { data, error } = await db
        .from("signer_invites")
        .insert(
          seats.map((s) => ({
            draft_id: draftId,
            name: s.name,
            role: s.role,
            email: s.email,
            token: `${RUN_ID}_${randomUUID()}`,
          })),
        )
        .select("id, name");
      if (error || !data)
        throw new Error(`invites insert: ${error?.message ?? "no rows"}`);
      // Insert order is not guaranteed to survive the round trip; bind by name.
      for (const seat of seats) {
        const row = (data as Array<{ id: string; name: string }>).find(
          (r) => r.name === seat.name,
        );
        assert(row, `invite row for ${seat.name} not returned`);
        inviteIds.push(row.id);
      }
    }

    for (const [i, seat] of seats.entries()) {
      const { data, error } = await db
        .from("signer_invites")
        .update({
          status: "accepted",
          wallet: seat.signer.address,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", inviteIds[i])
        .eq("status", "invited")
        .select("id");
      if (error) throw new Error(`invite accept: ${error.message}`);
      assert(
        (data ?? []).length === 1,
        `accept of seat "${seat.name}" bound ${(data ?? []).length} rows, expected 1`,
      );
      console.log(`   ${seat.name} -> ${seat.signer.address}`);
    }

    {
      // Same UPDATE again: the status filter must now match nothing.
      const { data, error } = await db
        .from("signer_invites")
        .update({ status: "accepted", wallet: deployer.address })
        .eq("id", inviteIds[0])
        .eq("status", "invited")
        .select("id");
      if (error) throw new Error(`invite re-accept probe: ${error.message}`);
      assert(
        (data ?? []).length === 0,
        "a second accept re-bound an already-accepted seat — single-use guard is gone",
      );
    }
    console.log("   re-accept blocked (single-use) ✓");

    // -------------------------------------------------------------------
    // [3] create-onchain — layout -> spec hash -> create_edition -> mirror,
    // the same sequence lib/editions/create.ts runs behind
    // POST /api/studio/drafts/[id]/create-onchain.
    // -------------------------------------------------------------------
    console.log("\n[3] create-onchain (create_edition + Open + mirror)");
    const templateBytes = readFileSync(TEMPLATE_PATH);
    const templateSha256Hex = hex(sha256(templateBytes));

    const baseLayout: unknown = JSON.parse(
      readFileSync(DEFAULT_LAYOUT_PATH, "utf8"),
    );
    const layout = editionReadyLayoutSchema.parse({
      ...(baseLayout as Record<string, unknown>),
      signers: seats.map((s) => ({
        wallet: s.signer.address,
        name: s.name,
        role: s.role,
      })),
      signatures: autoSignatureBoxes(seats.length),
    });
    assert(
      layout.template.sha256 === templateSha256Hex,
      `default-layout.json template sha ${layout.template.sha256} != the committed PNG's ${templateSha256Hex} — regenerate with \`tsx scripts/gen-default-template.ts\``,
    );
    const specHashBytes = sha256(canonicalizeLayout(layout));

    const [config] = await findConfigPda();
    const cfg = await fetchConfig(rpc, config);
    assert(cfg, "config not found on-chain — run `pnpm seed:onchain` first");
    const editionId = cfg.editionsCreated;
    const [edition] = await findEditionPda(editionId);
    editionAddress = edition;

    await send(
      rpc,
      deployer,
      [
        getCreateEditionInstruction({
          payer: deployer,
          config,
          edition,
          name: editionName,
          specHash: specHashBytes,
          maxSupply: BigInt(meta.maxSupply),
          signers: seats.map((s) => ({
            pubkey: s.signer.address,
            name: s.name,
            role: s.role,
          })),
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

    {
      const { error } = await db.from("editions").insert({
        address: edition,
        slug,
        name: editionName,
        description: meta.description,
        template_sha256: layout.template.sha256,
        layout,
        spec_hash: hex(specHashBytes),
        max_supply: meta.maxSupply,
        status: "Open",
        completion_date: meta.completionDate,
        tx_sig: sigs[sigs.length - 1][1],
      });
      if (error) throw new Error(`editions mirror: ${error.message}`);
    }
    {
      const { error } = await db.from("edition_signers").insert(
        seats.map((s, position) => ({
          edition_address: edition,
          position,
          wallet: s.signer.address,
          name: s.name,
          role: s.role,
        })),
      );
      if (error) throw new Error(`edition_signers mirror: ${error.message}`);
    }
    {
      const { error } = await db
        .from("edition_drafts")
        .update({
          chain_address: edition,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftId);
      if (error) throw new Error(`draft chain_address link: ${error.message}`);
    }
    console.log(`   edition=${edition} (id ${editionId}) mirrored + linked ✓`);

    // -------------------------------------------------------------------
    // [4] request_certificate x2 — two holders, so step 5 is a real batch.
    // -------------------------------------------------------------------
    console.log("\n[4] request_certificate x2");
    const holders = [
      { name: "Estudante E2E Um", signer: await generateKeyPairSigner() },
      { name: "Estudante E2E Dois", signer: await generateKeyPairSigner() },
    ];
    const certs: string[] = [];

    await send(
      rpc,
      deployer,
      holders.map((h) => transferSol(deployer, h.signer.address, 20_000_000n)),
      "fund_students",
    );

    for (const holder of holders) {
      const [cert] = await findCertPda(edition, holder.signer.address);
      certs.push(cert);
      const salt = new Uint8Array(randomBytes(32));
      const nameCommitment = sha256(
        new Uint8Array([...salt, ...new TextEncoder().encode(holder.name)]),
      );

      // Mirror row first, mirroring the real prepare-request ordering: the
      // plaintext name lands off-chain before the commitment goes on-chain.
      const { error } = await db.from("certificates").insert({
        address: cert,
        edition_address: edition,
        owner_wallet: holder.signer.address,
        student_name: holder.name,
        name_salt: hex(salt),
        status: "Requested",
        signer_bitmap: 0,
        verify_code: verifyCode(cert),
      });
      if (error) throw new Error(`certificates mirror: ${error.message}`);

      const sig = await send(
        rpc,
        deployer,
        [
          getRequestCertificateInstruction({
            student: holder.signer,
            edition,
            certificate: cert,
            nameCommitment,
          }),
        ],
        `request_${holder.name.split(" ").pop()?.toLowerCase()}`,
      );
      await db
        .from("certificates")
        .update({ request_tx: sig })
        .eq("address", cert);
    }
    console.log(`   certificates=[${certs.join(", ")}]`);

    // -------------------------------------------------------------------
    // [5] batch sign — one tx per signer carrying BOTH sign_certificate ixs,
    // the shape lib/chain/certificator.ts#buildSignBatchTxs produces (chunked
    // 20/tx per edition; two is enough to prove the chunk is a chunk).
    // -------------------------------------------------------------------
    console.log("\n[5] sign_certificate (batched: 2 ixs per signer tx)");
    const signerTxs: Array<{
      position: number;
      wallet: string;
      tx: string;
      signedAt: string;
    }> = [];
    for (const [position, seat] of seats.entries()) {
      const sig = await send(
        rpc,
        deployer,
        certs.map((cert) =>
          getSignCertificateInstruction({
            signer: seat.signer,
            edition,
            certificate: cert,
          }),
        ),
        `sign_batch_${position}`,
      );
      signerTxs.push({
        position,
        wallet: seat.signer.address,
        tx: sig,
        signedAt: new Date().toISOString(),
      });
    }

    for (const cert of certs) {
      const signed = await retry(
        () =>
          fetchCertificate(rpc, cert).then(
            (c) => c ?? Promise.reject(new Error("cert not visible yet")),
          ),
        `fetch ${cert} after sign`,
      );
      assert(
        signed.status === "FullySigned",
        `${cert}: expected FullySigned, got ${signed.status}`,
      );
      assert(
        signed.signedMask === 0b11,
        `${cert}: expected mask 0b11, got ${signed.signedMask.toString(2)}`,
      );
      const { error } = await db
        .from("certificates")
        .update({
          status: "FullySigned",
          signer_bitmap: 0b11,
          signer_txs: signerTxs,
          updated_at: new Date().toISOString(),
        })
        .eq("address", cert);
      if (error) throw new Error(`sign mirror: ${error.message}`);
    }
    console.log(`   both certificates FullySigned (mask 0b11) ✓`);

    // -------------------------------------------------------------------
    // [6] claim the first certificate — the canonical artifact is RENDERED by
    // apps/web/lib/render/render.ts from the same inputs the claim pipeline
    // feeds it (lib/chain/claim.ts#buildClaimArtifact), then committed
    // on-chain, stored in `certs/` and mirrored. Rendering for real is what
    // makes the PDF hop in [7] mean something: the export re-runs this renderer
    // and refuses to print a document whose re-render hashes differently.
    //
    // Unique per run without any padding trick — the certificate PDA is drawn
    // into the artwork, and it is derived from a fresh edition and a fresh
    // student keypair — so the program's duplicate-artifact_hash refusal
    // (HashIndex is `init`, never `init_if_needed`) is never provoked.
    // -------------------------------------------------------------------
    const cert = certs[0];
    console.log(`\n[6] claim_certificate ${cert}`);
    const rendered = await renderCanonicalArtifact({
      templatePng: templateBytes,
      layout,
      values: {
        studentName: holders[0].name,
        dateText: certDateText(meta.completionDate),
        certId: cert,
        verifyUrl: `${appUrl()}/verify/${cert}`,
      },
      signers: seats.map((s) => ({ name: s.name, role: s.role })),
    });
    const artifactBytes = rendered.png;
    artifactHashHex = rendered.sha256hex;
    const artifactHash = sha256(artifactBytes);
    assert(
      hex(artifactHash) === artifactHashHex,
      "the renderer's own sha256 disagrees with the bytes it returned",
    );
    console.log(
      `   rendered ${artifactBytes.byteLength} bytes -> ${artifactHashHex.slice(0, 16)}…`,
    );
    const [hashIndex] = await findHashIndexPda(artifactHash);

    const claimSig = await send(
      rpc,
      deployer,
      [
        getClaimCertificateInstruction({
          student: holders[0].signer,
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

    const hi = await retry(
      () =>
        fetchHashIndex(rpc, hashIndex).then(
          (h) => h ?? Promise.reject(new Error("hashindex not visible yet")),
        ),
      "fetch hashindex",
    );
    assert(
      hi.certificate === cert,
      `HashIndex.certificate ${hi.certificate} != ${cert}`,
    );
    const claimed = await retry(
      () =>
        fetchCertificate(rpc, cert).then(
          (c) => c ?? Promise.reject(new Error("cert not visible yet")),
        ),
      "fetch cert after claim",
    );
    assert(
      claimed.status === "Claimed",
      `expected Claimed, got ${claimed.status}`,
    );
    assert(
      hex(claimed.artifactHash) === artifactHashHex,
      "on-chain artifact_hash != the artifact this run built",
    );

    const artifactPath = `${artifactHashHex}.png`;
    {
      const { error } = await db.storage
        .from("certs")
        .upload(artifactPath, artifactBytes, {
          contentType: "image/png",
          upsert: true,
        });
      if (error) throw new Error(`certs upload: ${error.message}`);
    }
    const imageUrl = db.storage.from("certs").getPublicUrl(artifactPath)
      .data.publicUrl;

    console.log("   mint soulbound Core asset + record_asset");
    const umi = makeUmi(rpcUrl);
    const coreCollection = await retry(
      () => fetchCollection(umi, publicKey(collection)),
      "fetch collection",
    );
    const assetSigner = generateSigner(umi);
    const mintRes = await create(umi, {
      asset: assetSigner,
      collection: coreCollection,
      owner: publicKey(holders[0].signer.address),
      name: `${editionName} #${claimed.certNumber}`,
      uri: `${baseUrl}/metadata/${artifactHashHex}.json`,
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
            { key: "artifact_sha256", value: artifactHashHex },
            { key: "verify_url", value: `${baseUrl}/verify/${cert}` },
          ],
        },
      ],
    }).sendAndConfirm(umi);
    const assetAddress = assetSigner.publicKey.toString();
    await retry(
      () => fetchAsset(umi, assetSigner.publicKey),
      "confirm asset visible",
    );
    sigs.push(["mint_asset", base58.deserialize(mintRes.signature)[0]]);
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
      "record_asset",
    );

    {
      const { error } = await db
        .from("certificates")
        .update({
          status: "Claimed",
          cert_number: Number(claimed.certNumber),
          asset: assetAddress,
          sha256: artifactHashHex,
          image_url: imageUrl,
          claim_tx: claimSig,
          completed_at: meta.completionDate,
          updated_at: new Date().toISOString(),
        })
        .eq("address", cert);
      if (error) throw new Error(`claim mirror: ${error.message}`);
    }
    console.log(
      `   Claimed #${claimed.certNumber} asset=${assetAddress} artifact=${artifactHashHex.slice(0, 16)}… ✓`,
    );

    // -------------------------------------------------------------------
    // [7] the export — %PDF- header, and the XMP's artifact hash reconciled
    // against the canonical PNG as STORED, not merely as remembered.
    // -------------------------------------------------------------------
    console.log(`\n[7] GET ${baseUrl}/api/certificates/${cert}/pdf`);
    const pdfRes = await retry(
      async () => {
        const r = await fetch(
          `${baseUrl}/api/certificates/${cert}/pdf?lang=${PDF_LOCALE}`,
        );
        if (!r.ok) {
          throw new Error(
            `pdf route returned ${r.status}: ${(await r.text()).slice(0, 300)}`,
          );
        }
        return r;
      },
      "fetch certificate PDF",
      5,
      2000,
    );
    const pdf = Buffer.from(await pdfRes.arrayBuffer());
    console.log(
      `   ${pdf.byteLength} bytes, ${pdfRes.headers.get("content-type")}`,
    );

    assert(
      pdf.subarray(0, 5).toString("latin1") === "%PDF-",
      `response is not a PDF (starts with ${JSON.stringify(pdf.subarray(0, 16).toString("latin1"))})`,
    );

    // The XMP packet is written uncompressed precisely so it stays greppable
    // in the raw bytes (lib/pdf/build.ts).
    const raw = pdf.toString("latin1");
    const xmpHash = /certify:artifactSha256="([0-9a-f]{64})"/.exec(raw);
    assert(
      xmpHash,
      "certify:artifactSha256 not found in the PDF's XMP packet — the metadata contract is broken",
    );
    assert(
      xmpHash[1] === artifactHashHex,
      `XMP artifactSha256 ${xmpHash[1]} != canonical artifact ${artifactHashHex}`,
    );

    const xmpCode = /certify:verifyCode="([0-9A-Z]{8})"/.exec(raw);
    assert(xmpCode, "certify:verifyCode not found in the PDF's XMP packet");
    assert(
      xmpCode[1] === verifyCode(cert),
      `XMP verifyCode ${xmpCode[1]} != derived ${verifyCode(cert)}`,
    );

    // Close the loop through storage: the object the verify page links is the
    // very PNG whose hash the chain and the document both carry.
    const stored = await retry(
      async () => {
        const r = await fetch(imageUrl);
        if (!r.ok) throw new Error(`certs object ${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      },
      "download stored artifact",
      5,
      1500,
    );
    assert(
      hex(sha256(stored)) === artifactHashHex,
      `stored certs/${artifactPath} hashes to ${hex(sha256(stored))}, not ${artifactHashHex}`,
    );
    console.log("   %PDF- ✓  XMP artifactSha256 == chain == certs/ object ✓");
    console.log("   XMP verifyCode == derived code ✓");

    // -------------------------------------------------------------------
    // [8] the printed code resolves back — the anon column grant 0005 added.
    // -------------------------------------------------------------------
    console.log(`\n[8] GET /api/verify/resolve-code/${verifyCode(cert)}`);
    const codeRes = await fetch(
      `${baseUrl}/api/verify/resolve-code/${verifyCode(cert)}`,
    );
    assert(codeRes.ok, `resolve-code returned ${codeRes.status}`);
    const resolved = (await codeRes.json()) as { address: string | null };
    assert(
      resolved.address === cert,
      `resolve-code returned ${resolved.address}, expected ${cert}`,
    );
    console.log("   resolves to the certificate ✓");

    console.log("\n== E2E PASS — all assertions green ==");
    console.log(`   ${sigs.length} transactions:`);
    for (const [label, s] of sigs) console.log(`   - ${label}: ${s}`);
  } finally {
    if (KEEP) {
      console.log(
        `\n(--keep) leaving draft=${draftId} edition=${editionAddress} in place.`,
      );
    } else {
      await cleanup(db, draftId, editionAddress, artifactHashHex);
    }
  }
}

/**
 * Removes everything this run wrote to the shared project. `editions` cascades
 * to `edition_signers` + `certificates` and `edition_drafts` cascades to
 * `signer_invites` (0001_init.sql / 0005_overhaul.sql: `on delete cascade`), so
 * only the two parents and the storage objects need naming. Nothing here
 * throws: cleanup must never bury a real finding under a delete error.
 */
async function cleanup(
  db: SupabaseClient,
  draftId: string | null,
  editionAddress: string | null,
  artifactHashHex: string | null,
): Promise<void> {
  console.log("\nCleaning up (service role)...");
  const swallow = async (
    label: string,
    fn: () => PromiseLike<{ error: { message: string } | null }>,
  ): Promise<void> => {
    try {
      const { error } = await fn();
      if (error) console.warn(`   ${label}: ${error.message}`);
    } catch (e) {
      console.warn(`   ${label}: ${String(e)}`);
    }
  };

  if (editionAddress) {
    await swallow("editions", () =>
      db.from("editions").delete().eq("address", editionAddress),
    );
  }
  if (draftId) {
    await swallow("edition_drafts", () =>
      db.from("edition_drafts").delete().eq("id", draftId),
    );
  }
  if (artifactHashHex) {
    await swallow("certs object", () =>
      db.storage.from("certs").remove([`${artifactHashHex}.png`]),
    );
    // The PDF route caches its output in `metadata` under certs-pdf/, keyed by
    // artifact hash + locale + whether a seal was applied — list rather than
    // guess which variants this run produced.
    try {
      const { data } = await db.storage
        .from("metadata")
        .list("certs-pdf", { search: artifactHashHex });
      const paths = (data ?? []).map((o) => `certs-pdf/${o.name}`);
      if (paths.length > 0) {
        await swallow("pdf cache", () =>
          db.storage.from("metadata").remove(paths),
        );
      }
    } catch (e) {
      console.warn(`   pdf cache list: ${String(e)}`);
    }
  }
  console.log("Cleanup complete.");
}

main().catch((e: unknown) => {
  console.error("\nE2E FAILED:", e);
  process.exit(1);
});
