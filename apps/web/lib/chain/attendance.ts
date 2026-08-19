import "server-only";

// The ONLY module importing mpl-bubblegum. Server-custodial attendance mints:
// OPERATOR is tree creator, collection authority, and fee payer — participants
// pay nothing. Per-event MPL-Core collections carry the BubblegumV2 plugin
// (required by mintV2). Asset ids parse only after finalization, so
// resolveAttendanceAssetId is best-effort and callers never block on it.

import { generateSigner, publicKey, some } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { createCollection } from "@metaplex-foundation/mpl-core";
import {
  mintV2,
  parseLeafFromMintV2Transaction,
} from "@metaplex-foundation/mpl-bubblegum";
import { fail } from "@/lib/errors";
import { getOperatorUmi, retryFetch } from "@/lib/chain/umi";

function assertTreeConfigured(): string {
  const tree = process.env.ATTENDANCE_MERKLE_TREE;
  if (!tree) {
    fail(
      "CHAIN_PROGRAM_NOT_DEPLOYED",
      "Árvore de NFTs de presença não configurada (ATTENDANCE_MERKLE_TREE).",
      { retryable: true },
    );
  }
  return tree;
}

/** Creates the event's Core collection (BubblegumV2 plugin, operator authority). */
export async function createEventCollection(input: {
  name: string;
  metadataUri: string;
}): Promise<string> {
  const umi = getOperatorUmi();
  const collection = generateSigner(umi);
  await createCollection(umi, {
    collection,
    name: input.name,
    uri: input.metadataUri,
    plugins: [{ type: "BubblegumV2" }],
  }).sendAndConfirm(umi);
  return collection.publicKey.toString();
}

/** Mints one attendance cNFT to `owner`. Operator pays; participant signs nothing. */
export async function mintAttendanceAsset(input: {
  coreCollection: string;
  owner: string;
  name: string;
  metadataUri: string;
}): Promise<{ txSig: string }> {
  const tree = assertTreeConfigured();
  const umi = getOperatorUmi();
  const { signature } = await mintV2(umi, {
    collectionAuthority: umi.identity,
    leafOwner: publicKey(input.owner),
    merkleTree: publicKey(tree),
    coreCollection: publicKey(input.coreCollection),
    metadata: {
      name: input.name,
      uri: input.metadataUri,
      sellerFeeBasisPoints: 0,
      collection: some(publicKey(input.coreCollection)),
      creators: [],
    },
  }).sendAndConfirm(umi);
  return { txSig: base58.deserialize(signature)[0] };
}

/** Best-effort asset-id resolution — valid only after finalization; null until then. */
export async function resolveAttendanceAssetId(
  txSig: string,
): Promise<string | null> {
  try {
    const umi = getOperatorUmi();
    const leaf = await retryFetch(
      () => parseLeafFromMintV2Transaction(umi, base58.serialize(txSig)),
      3,
      4000,
    );
    return leaf.id.toString();
  } catch {
    return null;
  }
}
