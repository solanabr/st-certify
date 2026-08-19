/**
 * Bootstrap da árvore Merkle compartilhada (Bubblegum v2) para os mints de
 * presença — depth 14 / buffer 64 / canopy 8 (capacidade 16.384 folhas).
 * Idempotente: pula a criação se ATTENDANCE_MERKLE_TREE já aponta para uma
 * conta existente on-chain. Imprime a linha ATTENDANCE_MERKLE_TREE=<addr>
 * para copiar em .env (e no Vercel) — não escreve nos arquivos sozinho.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  publicKey,
} from "@metaplex-foundation/umi";
import { createTreeV2, mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { mplAccountCompression } from "@metaplex-foundation/mpl-account-compression";

try {
  process.loadEnvFile();
} catch {
  // Nenhum .env encontrado — assume que o ambiente já está configurado.
}

const ROOT = join(import.meta.dirname, "..");

/**
 * OPERATOR_SECRET_KEY é um array JSON inline (`[12,34,...]`) ou um caminho
 * (relativo à raiz do repo) para um arquivo nesse formato — mesma convenção
 * de apps/web/lib/chain/server-tx.ts#loadKeypairBytes.
 */
function loadKeypairBytes(envVal: string): Uint8Array {
  const trimmed = envVal.trim();
  const raw = trimmed.startsWith("[")
    ? trimmed
    : readFileSync(isAbsolute(trimmed) ? trimmed : join(ROOT, trimmed), "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Never rethrow the raw SyntaxError — V8 echoes a snippet of the
    // offending input in its message, which could leak key-byte fragments.
    throw new Error("Chave inválida: JSON malformado.");
  }
  if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === "number")) {
    throw new Error(
      "OPERATOR_SECRET_KEY inválida: formato inesperado (esperado array JSON de bytes).",
    );
  }
  return new Uint8Array(parsed);
}

const RPC = process.env.NEXT_PUBLIC_RPC_URL;
const OPERATOR = process.env.OPERATOR_SECRET_KEY;
if (!RPC || !OPERATOR) {
  throw new Error("NEXT_PUBLIC_RPC_URL / OPERATOR_SECRET_KEY ausentes no .env");
}

const umi = createUmi(RPC).use(mplBubblegum()).use(mplAccountCompression());
umi.use(
  keypairIdentity(
    umi.eddsa.createKeypairFromSecretKey(loadKeypairBytes(OPERATOR)),
  ),
);

async function main(): Promise<void> {
  const existing = process.env.ATTENDANCE_MERKLE_TREE;
  if (existing) {
    const account = await umi.rpc.getAccount(publicKey(existing));
    if (account.exists) {
      console.log(`Árvore já existe: ${existing} — nada a fazer.`);
      return;
    }
    console.log(
      `ATTENDANCE_MERKLE_TREE=${existing} está definida mas a conta não existe on-chain — criando uma nova árvore.`,
    );
  }

  const merkleTree = generateSigner(umi);
  console.log("Criando árvore (depth 14 / buffer 64 / canopy 8)…");
  const builder = await createTreeV2(umi, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
    canopyDepth: 8,
  });
  const { result } = await builder.sendAndConfirm(umi, {
    confirm: { commitment: "finalized" },
  });
  if (result.value.err) {
    throw new Error(
      `create_tree_v2 falhou on-chain: ${JSON.stringify(result.value.err)}`,
    );
  }

  console.log(`\nATTENDANCE_MERKLE_TREE=${merkleTree.publicKey.toString()}`);
  console.log("Adicione a linha acima ao .env (e ao Vercel).");
}

main().catch((e: unknown) => {
  console.error("CRIAÇÃO DA ÁRVORE FALHOU:", e);
  process.exit(1);
});
