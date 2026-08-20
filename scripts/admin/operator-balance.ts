/**
 * [ops-1] Checks the OPERATOR wallet's SOL balance against a mint-floor
 * threshold (OPERATOR is the fee payer for every attendance mint, ~95,000
 * lamports each — see README.md "Attendance NFTs"). Also reports
 * DEPLOYER/NOTARY balances if those keys are configured, informationally —
 * neither pays for attendance mints, so they aren't checked against the
 * floor. Read-only: derives each public key from its secret key locally,
 * never signs or sends anything.
 *
 * Usage:
 *   npx tsx scripts/admin/operator-balance.ts [--min-mints 50] [--threshold-sol 0.01] [--json]
 *
 * Exit codes: 0 OK, 1 operator balance below floor, 2 couldn't check (RPC
 * unreachable, OPERATOR_SECRET_KEY missing/invalid).
 */

import { publicKey as toPublicKey } from "@metaplex-foundation/umi";
import {
  EXIT,
  MINT_COST_LAMPORTS,
  buildReadUmi,
  getFlagNumber,
  hasFlag,
  loadKeypairBytes,
  loadRootEnv,
  printHelpAndExit,
  printTable,
  resolveRpcUrl,
} from "./_shared.js";

const HELP = `
operator-balance — check OPERATOR (and DEPLOYER/NOTARY, if configured) SOL balance.

Usage:
  npx tsx scripts/admin/operator-balance.ts [options]

Options:
  --min-mints <n>       Floor = n * 95,000 lamports (default: 50)
  --threshold-sol <n>   Floor in SOL, overrides --min-mints
  --json                Machine-readable output
  -h, --help            Show this help

Exit codes: 0 OK, 1 operator balance below floor, 2 couldn't check.
`;

interface RoleBalance {
  role: "operator" | "deployer" | "notary";
  configured: boolean;
  pubkey: string | null;
  lamports: bigint | null;
  error: string | null;
}

const ENV_BY_ROLE = {
  operator: "OPERATOR_SECRET_KEY",
  deployer: "DEPLOYER_SECRET_KEY",
  notary: "NOTARY_SECRET_KEY",
} as const;

async function checkRole(
  role: keyof typeof ENV_BY_ROLE,
  umi: ReturnType<typeof buildReadUmi>,
): Promise<RoleBalance> {
  const envVal = process.env[ENV_BY_ROLE[role]];
  if (!envVal) {
    return {
      role,
      configured: false,
      pubkey: null,
      lamports: null,
      error: null,
    };
  }
  try {
    const bytes = loadKeypairBytes(envVal);
    const pubkey = umi.eddsa.createKeypairFromSecretKey(bytes).publicKey;
    const balance = await umi.rpc.getBalance(toPublicKey(pubkey));
    return {
      role,
      configured: true,
      pubkey: pubkey.toString(),
      lamports: balance.basisPoints,
      error: null,
    };
  } catch (err) {
    return {
      role,
      configured: true,
      pubkey: null,
      lamports: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "-h", "--help")) printHelpAndExit(HELP);
  loadRootEnv();

  const json = hasFlag(argv, "--json");
  const minMints = getFlagNumber(argv, "min-mints", 50);
  const thresholdSolFlag = getFlagNumber(argv, "threshold-sol", NaN);
  const floorLamports = Number.isFinite(thresholdSolFlag)
    ? BigInt(Math.round(thresholdSolFlag * 1_000_000_000))
    : BigInt(minMints) * BigInt(MINT_COST_LAMPORTS);

  const rpcUrl = resolveRpcUrl();
  if (!rpcUrl) {
    console.error("ERROR: NEXT_PUBLIC_RPC_URL not configured.");
    process.exit(EXIT.ERROR);
  }
  if (!process.env.OPERATOR_SECRET_KEY) {
    console.error("ERROR: OPERATOR_SECRET_KEY not configured.");
    process.exit(EXIT.ERROR);
  }

  const umi = buildReadUmi(rpcUrl);
  const results = await Promise.all(
    (Object.keys(ENV_BY_ROLE) as (keyof typeof ENV_BY_ROLE)[]).map((role) =>
      checkRole(role, umi),
    ),
  );

  const operator = results.find((r) => r.role === "operator")!;
  if (operator.error) {
    if (json) {
      console.log(
        JSON.stringify({ ok: false, error: operator.error }, null, 2),
      );
    } else {
      console.error(
        `ERROR: couldn't read operator balance — ${operator.error}`,
      );
    }
    process.exit(EXIT.ERROR);
  }

  const operatorLamports = operator.lamports ?? 0n;
  const belowFloor = operatorLamports < floorLamports;
  const affordableMints = operatorLamports / BigInt(MINT_COST_LAMPORTS);

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: !belowFloor,
          floorLamports: floorLamports.toString(),
          balances: results.map((r) => ({
            ...r,
            lamports: r.lamports?.toString() ?? null,
          })),
          affordableMints: affordableMints.toString(),
        },
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
    );
  } else {
    console.log("== Operator / deployer / notary balances ==\n");
    const rows: string[][] = [["role", "configured", "pubkey", "SOL", "note"]];
    for (const r of results) {
      rows.push([
        r.role,
        r.configured ? "yes" : "no",
        r.pubkey ?? "-",
        r.lamports !== null ? (Number(r.lamports) / 1e9).toFixed(6) : "-",
        r.error ? `ERROR: ${r.error}` : r.configured ? "" : "not set — skipped",
      ]);
    }
    printTable(rows);
    console.log(
      `\nOperator floor: ${(Number(floorLamports) / 1e9).toFixed(6)} SOL ` +
        `(${Number.isFinite(thresholdSolFlag) ? "explicit --threshold-sol" : `${minMints} mints x ${MINT_COST_LAMPORTS} lamports`})`,
    );
    console.log(
      `Operator can currently afford ~${affordableMints} more mint(s).`,
    );
    console.log(
      belowFloor
        ? `\nWARNING: operator balance is BELOW the floor. Top up OPERATOR_SECRET_KEY's wallet.`
        : `\nOperator balance OK.`,
    );
  }

  process.exit(belowFloor ? EXIT.FINDINGS : EXIT.OK);
}

main().catch((err: unknown) => {
  console.error(
    "operator-balance FAILED:",
    err instanceof Error ? err.message : err,
  );
  process.exit(EXIT.ERROR);
});
