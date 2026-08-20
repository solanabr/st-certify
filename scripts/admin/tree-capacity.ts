/**
 * [chain-1] Reads the shared Bubblegum v2 Merkle tree's on-chain state and
 * reports leaf usage against its capacity. The tree is un-resettable
 * (depth 14 = 16,384 leaves, see create-attendance-tree.ts) — once full, no
 * more attendance NFTs can be minted onto it, ever.
 *
 * Approximation: there is no single documented "leaves used" field on a
 * ConcurrentMerkleTree account. Two candidates were considered:
 *   - `tree.sequenceNumber` — a count of tree modifications since creation.
 *   - `tree.rightMostPath.index + 1` — the 1-based position of the most
 *     recently appended leaf.
 * For a purely-append-only tree (true here — attendance NFTs are never
 * burned/replaced, unlike the revocable certificate flow) these two are
 * expected to agree, but spot-checking this script against the live devnet
 * tree found them consistently one apart, and the exact increment-order
 * semantics of the underlying spl-concurrent-merkle-tree struct aren't
 * pinned down in the indexed docs/source. Rather than assert a specific
 * relationship this script can't fully verify, it uses whichever of the two
 * is LARGER as the "used" estimate — conservative in the direction that
 * matters for a capacity warning (never under-counts, so it can only warn
 * early, never late). Both raw values are reported so a human can sanity
 * check them directly if this ever matters precisely (e.g. right at the
 * capacity boundary).
 *
 * Usage:
 *   npx tsx scripts/admin/tree-capacity.ts [--tree <address>] [--warn 0.8] [--critical 0.95] [--json]
 *
 * Read-only. Exit codes: 0 OK, 1 at/above warn or critical threshold,
 * 2 couldn't read the tree (RPC unreachable, tree not configured/found).
 */

import { publicKey as toPublicKey } from "@metaplex-foundation/umi";
import { fetchMerkleTree } from "@metaplex-foundation/mpl-account-compression";
import {
  ATTENDANCE_CAPACITY_CRITICAL,
  ATTENDANCE_CAPACITY_WARN,
  ATTENDANCE_TREE_CAPACITY,
  EXIT,
  buildReadUmi,
  getFlagValue,
  hasFlag,
  loadRootEnv,
  printHelpAndExit,
  resolveRpcUrl,
} from "./_shared.js";

const HELP = `
tree-capacity — report leaf usage of the shared attendance Merkle tree.

Usage:
  npx tsx scripts/admin/tree-capacity.ts [options]

Options:
  --tree <address>    Tree address (default: $ATTENDANCE_MERKLE_TREE)
  --warn <fraction>    Warn threshold, 0-1 (default: 0.8)
  --critical <fraction> Critical threshold, 0-1 (default: 0.95)
  --json               Machine-readable output
  -h, --help            Show this help

"Used" is the larger of two on-chain candidates (sequenceNumber vs
rightMostPath.index + 1) — see script header comment for why.

Read-only. Exit codes: 0 OK, 1 at/above warn or critical threshold,
2 couldn't read the tree.
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "-h", "--help")) printHelpAndExit(HELP);
  loadRootEnv();

  const json = hasFlag(argv, "--json");
  const treeAddress =
    getFlagValue(argv, "tree") ?? process.env.ATTENDANCE_MERKLE_TREE;
  const warnFraction = Number(
    getFlagValue(argv, "warn") ?? ATTENDANCE_CAPACITY_WARN,
  );
  const criticalFraction = Number(
    getFlagValue(argv, "critical") ?? ATTENDANCE_CAPACITY_CRITICAL,
  );

  if (!treeAddress) {
    console.error(
      "ERROR: no tree address — pass --tree or set ATTENDANCE_MERKLE_TREE.",
    );
    process.exit(EXIT.ERROR);
  }
  const rpcUrl = resolveRpcUrl();
  if (!rpcUrl) {
    console.error("ERROR: NEXT_PUBLIC_RPC_URL not configured.");
    process.exit(EXIT.ERROR);
  }

  const umi = buildReadUmi(rpcUrl);

  let account: Awaited<ReturnType<typeof fetchMerkleTree>>;
  try {
    account = await fetchMerkleTree(umi, toPublicKey(treeAddress));
  } catch (err) {
    console.error(
      `ERROR: couldn't read tree ${treeAddress} — ${err instanceof Error ? err.message : err}`,
    );
    process.exit(EXIT.ERROR);
  }

  const sequenceNumber = account.tree.sequenceNumber;
  const rightmostCount = BigInt(account.tree.rightMostPath.index) + 1n;
  const used =
    sequenceNumber > rightmostCount ? sequenceNumber : rightmostCount;
  const candidatesDiffer = sequenceNumber !== rightmostCount;

  const onChainCapacity = 2 ** account.treeHeader.maxDepth;
  const capacityMismatch = onChainCapacity !== ATTENDANCE_TREE_CAPACITY;

  const capacity = BigInt(onChainCapacity);
  const usedFraction = capacity > 0n ? Number(used) / Number(capacity) : 1;
  const status =
    usedFraction >= criticalFraction
      ? "CRITICAL"
      : usedFraction >= warnFraction
        ? "WARN"
        : "OK";

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: status === "OK",
          status,
          tree: treeAddress,
          used: used.toString(),
          capacity: onChainCapacity,
          usedFraction,
          sequenceNumber: sequenceNumber.toString(),
          rightmostIndexCount: rightmostCount.toString(),
          candidatesDiffer,
          capacityMismatch,
          expectedCapacity: ATTENDANCE_TREE_CAPACITY,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`== Attendance tree capacity (${treeAddress}) ==\n`);
    console.log(`  used (conservative estimate): ${used}`);
    console.log(`    sequenceNumber:              ${sequenceNumber}`);
    console.log(`    rightMostPath.index + 1:     ${rightmostCount}`);
    if (candidatesDiffer) {
      console.log(
        `    (these two differ — see script header comment; using the larger one)`,
      );
    }
    console.log(`  capacity (2^maxDepth):         ${onChainCapacity}`);
    console.log(
      `  used fraction:                 ${(usedFraction * 100).toFixed(2)}%`,
    );
    console.log(`  status:                        ${status}`);
    if (capacityMismatch) {
      console.log(
        `\n  WARNING: on-chain capacity (${onChainCapacity}) != expected constant (${ATTENDANCE_TREE_CAPACITY}) — wrong tree address, or the constant in apps/web/lib/attendance/constants.ts is stale.`,
      );
    }
    if (status !== "OK") {
      console.log(
        `\n${status}: tree is ${(usedFraction * 100).toFixed(1)}% full. The tree is un-resettable — plan a new tree (create-attendance-tree.ts) before it fills.`,
      );
    } else {
      console.log("\nCapacity OK.");
    }
  }

  process.exit(status === "OK" ? EXIT.OK : EXIT.FINDINGS);
}

main().catch((err: unknown) => {
  console.error(
    "tree-capacity FAILED:",
    err instanceof Error ? err.message : err,
  );
  process.exit(EXIT.ERROR);
});
