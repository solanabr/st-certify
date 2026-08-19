/**
 * E2E de presença (devnet) — prova o caminho completo com os MESMOS formatos
 * que apps/web/lib/chain/attendance.ts usa em produção:
 *   createCollection (plugin BubblegumV2) -> mintV2 (carteira nova, operator
 *   paga) -> parseLeafFromMintV2Transaction (finalized) -> assert leaf.owner.
 * Também mede o custo real do mint (delta de lamports do operator) para
 * documentar em .env.example. Sai com código != 0 em qualquer falha.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  publicKey,
  some,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { createCollection, mplCore } from "@metaplex-foundation/mpl-core";
import {
  mintV2,
  mplBubblegum,
  parseLeafFromMintV2Transaction,
} from "@metaplex-foundation/mpl-bubblegum";
import { mplAccountCompression } from "@metaplex-foundation/mpl-account-compression";

try {
  process.loadEnvFile();
} catch {
  // Nenhum .env encontrado — assume que o ambiente já está configurado.
}

const ROOT = join(import.meta.dirname, "..");

/** Mesma convenção de create-attendance-tree.ts / server-tx.ts#loadKeypairBytes. */
function loadKeypairBytes(envVal: string): Uint8Array {
  const trimmed = envVal.trim();
  const raw = trimmed.startsWith("[")
    ? trimmed
    : readFileSync(isAbsolute(trimmed) ? trimmed : join(ROOT, trimmed), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === "number")) {
    throw new Error(
      "OPERATOR_SECRET_KEY inválida: formato inesperado (esperado array JSON de bytes).",
    );
  }
  return new Uint8Array(parsed);
}

const RPC = process.env.NEXT_PUBLIC_RPC_URL;
const OPERATOR = process.env.OPERATOR_SECRET_KEY;
const TREE = process.env.ATTENDANCE_MERKLE_TREE;

const explorerTx = (sig: string): string =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const explorerAddress = (addr: string): string =>
  `https://explorer.solana.com/address/${addr}?cluster=devnet`;
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

/** Backoff de leitura-após-escrita do RPC público de devnet (mesmo padrão de
 * lib/chain/umi.ts#retryFetch e scripts/e2e-devnet.ts#retry). */
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
  throw new Error(
    `${label}: desistiu após ${attempts} tentativas — ${String(last)}`,
  );
}

async function main(): Promise<void> {
  if (!RPC || !OPERATOR) {
    throw new Error(
      "NEXT_PUBLIC_RPC_URL / OPERATOR_SECRET_KEY ausentes no .env",
    );
  }
  assert(
    TREE,
    "ATTENDANCE_MERKLE_TREE ausente no .env — rode `pnpm tree:attendance` primeiro",
  );

  const umi = createUmi(RPC)
    .use(mplCore())
    .use(mplBubblegum())
    .use(mplAccountCompression());
  umi.use(
    keypairIdentity(
      umi.eddsa.createKeypairFromSecretKey(loadKeypairBytes(OPERATOR)),
    ),
  );

  console.log("== Attendance E2E (devnet) ==");
  console.log(`   operator=${umi.identity.publicKey}`);
  console.log(`   tree=${TREE}`);

  // 1) árvore configurada + existe on-chain -----------------------------
  const treeAccount = await umi.rpc.getAccount(publicKey(TREE));
  assert(treeAccount.exists, `árvore ${TREE} não existe on-chain`);
  console.log("\n[1] árvore confirmada on-chain ✓");

  // 2) createCollection (plugin BubblegumV2) -----------------------------
  const collectionName = `E2E Attendance ${Date.now()}`;
  const metadataUri = "https://example.com/e2e.json";
  console.log(
    `\n[2] createCollection "${collectionName}" (plugin BubblegumV2)`,
  );
  const collection = generateSigner(umi);
  const collectionRes = await createCollection(umi, {
    collection,
    name: collectionName,
    uri: metadataUri,
    plugins: [{ type: "BubblegumV2" }],
  }).sendAndConfirm(umi, { confirm: { commitment: "finalized" } });
  if (collectionRes.result.value.err) {
    throw new Error(
      `createCollection falhou on-chain: ${JSON.stringify(collectionRes.result.value.err)}`,
    );
  }
  const collectionSig = base58.deserialize(collectionRes.signature)[0];
  console.log(`   collection=${collection.publicKey}`);
  console.log(`   tx: ${explorerTx(collectionSig)}`);

  // 3) mintV2 para uma carteira nova — operator paga tudo -----------------
  const leafOwner = generateSigner(umi);
  console.log(
    `\n[3] mintV2 -> leafOwner=${leafOwner.publicKey} (carteira nova, sem fundos)`,
  );
  const balanceBefore = await umi.rpc.getBalance(umi.identity.publicKey);
  const mintRes = await mintV2(umi, {
    collectionAuthority: umi.identity,
    leafOwner: leafOwner.publicKey,
    merkleTree: publicKey(TREE),
    coreCollection: collection.publicKey,
    metadata: {
      name: "E2E Attendance Mint",
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
      collection: some(collection.publicKey),
      creators: [],
    },
  }).sendAndConfirm(umi, { confirm: { commitment: "finalized" } });
  if (mintRes.result.value.err) {
    throw new Error(
      `mintV2 falhou on-chain: ${JSON.stringify(mintRes.result.value.err)}`,
    );
  }
  const balanceAfter = await umi.rpc.getBalance(umi.identity.publicKey);
  const mintSig = base58.deserialize(mintRes.signature)[0];
  console.log(`   tx: ${explorerTx(mintSig)}`);

  // 4) parseLeafFromMintV2Transaction -> assert leaf.owner -----------------
  console.log("\n[4] parseLeafFromMintV2Transaction (finalized)");
  const leaf = await retry(
    () => parseLeafFromMintV2Transaction(umi, mintRes.signature),
    "parseLeafFromMintV2Transaction",
  );
  assert(
    leaf.owner === leafOwner.publicKey,
    `leaf.owner ${leaf.owner} != carteira esperada ${leafOwner.publicKey}`,
  );
  console.log(`   leaf.id (asset)=${leaf.id}`);
  console.log(`   leaf.owner=${leaf.owner} ✓`);
  console.log(`   explorer: ${explorerAddress(leaf.id.toString())}`);

  // 5) custo real do mint (delta de lamports do operator) -----------------
  const deltaLamports = balanceBefore.basisPoints - balanceAfter.basisPoints;
  const deltaSol = Number(deltaLamports) / 1_000_000_000;
  console.log("\n[5] custo do mintV2 (operator)");
  console.log(
    `   antes=${balanceBefore.basisPoints} lamports  depois=${balanceAfter.basisPoints} lamports`,
  );
  console.log(
    `   delta=${deltaLamports} lamports (~${deltaSol.toFixed(6)} SOL) — taxa de protocolo Bubblegum + taxa de tx`,
  );
  console.log(
    "   -> documentar esse valor como comentário de ATTENDANCE_MERKLE_TREE em .env.example",
  );

  console.log("\n== E2E PASS — createCollection + mintV2 + parseLeaf OK ==");
}

main().catch((e: unknown) => {
  console.error("\nE2E FALHOU:", e);
  process.exit(1);
});
