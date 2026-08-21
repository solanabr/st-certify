/**
 * Fills `certificates.verify_code` for rows issued before migration 0005 —
 * the 8-character Crockford base32 handle printed on PDFs and typed into
 * /verify (spec §8). New certificates get theirs at insert time
 * (insertPendingCertificate), so this is a one-shot run right after 0005 is
 * applied, plus a no-op safety net afterwards.
 *
 * The derivation is duplicated from apps/web/lib/verify-code.ts: scripts/ is
 * an isolated install that can't resolve the app's `@/` alias (same reason
 * _shared.ts re-implements loadKeypairBytes). A drifted copy here would write
 * codes the app can never look up again — permanently, since a code is printed
 * on issued documents — so before writing anything the script recomputes the
 * codes of rows the APP already stamped and aborts on any mismatch.
 *
 * Usage:
 *   npx tsx scripts/admin/backfill-verify-codes.ts [--execute] [--json]
 *
 * Defaults to dry-run (counts + a sample). --execute writes.
 *
 * Exit codes: 0 nothing to backfill or --execute completed cleanly, 1 rows
 * need backfilling (dry-run) or some writes failed (--execute), 2 couldn't run
 * the check (bad env, unreachable Supabase, derivation drift).
 */

import { createHash } from "node:crypto";
import {
  EXIT,
  buildSupabaseAdmin,
  hasFlag,
  loadRootEnv,
  printHelpAndExit,
  printTable,
  safeSupabase,
} from "./_shared.js";

const HELP = `
backfill-verify-codes — fill certificates.verify_code for pre-0005 rows.

Usage:
  npx tsx scripts/admin/backfill-verify-codes.ts [options]

Options:
  --execute   Actually write the codes (default: dry-run, counts + sample)
  --json      Machine-readable output
  -h, --help  Show this help

Run once after applying supabase/migrations/0005_overhaul.sql. Requires
NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

Exit codes: 0 nothing to do / done, 1 rows pending (dry-run) or partial write
failure, 2 couldn't run the check.
`;

// --- keep in sync with apps/web/lib/verify-code.ts ------------------------
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;

function verifyCode(certAddress: string): string {
  const digest = createHash("sha256").update(certAddress, "utf8").digest();
  let code = "";
  for (let group = 0; group < CODE_LENGTH; group++) {
    const bitOffset = group * 5;
    const byte = bitOffset >> 3;
    const shift = bitOffset & 7;
    const window = (digest[byte] << 8) | digest[byte + 1];
    code += CROCKFORD[(window >> (11 - shift)) & 0b11111];
  }
  return code;
}

/** Same vector as apps/web/lib/__tests__/verify-code.test.ts — catches a botched copy on an empty table. */
const GOLDEN_ADDRESS = "5vJRnAiVQKgVJvKZJmTHZ8gWx3nZgWEDbMFkTQ9SF2ZQ";
const GOLDEN_CODE = "C749RPNK";
// --------------------------------------------------------------------------

const PAGE = 500;
/** How many app-stamped rows to re-derive as a drift check before writing. */
const DRIFT_SAMPLE = 50;

interface CertRow {
  address: string;
  verify_code: string | null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "-h", "--help")) printHelpAndExit(HELP);
  loadRootEnv();

  const json = hasFlag(argv, "--json");
  const execute = hasFlag(argv, "--execute");

  if (verifyCode(GOLDEN_ADDRESS) !== GOLDEN_CODE) {
    console.error(
      "ERROR: this script's verify-code derivation no longer matches its " +
        "pinned vector — it has drifted from apps/web/lib/verify-code.ts. " +
        "Refusing to write.",
    );
    process.exit(EXIT.ERROR);
  }

  const { admin, missingEnv } = buildSupabaseAdmin();
  if (!admin) {
    console.error(
      `ERROR: Supabase not configured — missing ${missingEnv.join(", ")}`,
    );
    process.exit(EXIT.ERROR);
  }

  // Drift check against reality: rows the app itself stamped must re-derive to
  // the same code. Skipped on a first run, when no such rows exist yet.
  const { data: stamped, error: stampedError } = await safeSupabase<CertRow[]>(
    () =>
      admin
        .from("certificates")
        .select("address, verify_code")
        .not("verify_code", "is", null)
        .limit(DRIFT_SAMPLE),
  );
  if (stampedError) {
    console.error(`ERROR: ${stampedError.message}`);
    process.exit(EXIT.ERROR);
  }
  const drifted = (stamped ?? []).filter(
    (row) => row.verify_code !== verifyCode(row.address),
  );
  if (drifted.length > 0) {
    console.error(
      `ERROR: ${drifted.length} existing row(s) carry a code this script would ` +
        `not reproduce (e.g. ${drifted[0].address} stored ` +
        `${drifted[0].verify_code}, derived ${verifyCode(drifted[0].address)}). ` +
        "Reconcile apps/web/lib/verify-code.ts with this script before writing.",
    );
    process.exit(EXIT.ERROR);
  }

  // Collect every un-stamped row first (offset pagination over a stable order;
  // PostgREST caps a single response at 1000 rows).
  const pending: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await safeSupabase<CertRow[]>(() =>
      admin
        .from("certificates")
        .select("address, verify_code")
        .is("verify_code", null)
        .order("address", { ascending: true })
        .range(from, from + PAGE - 1),
    );
    if (error) {
      console.error(`ERROR: ${error.message}`);
      process.exit(EXIT.ERROR);
    }
    const page = data ?? [];
    pending.push(...page.map((row) => row.address));
    if (page.length < PAGE) break;
  }

  if (pending.length === 0) {
    console.log(
      json
        ? JSON.stringify(
            { ok: true, pending: 0, written: 0, checked: stamped?.length ?? 0 },
            null,
            2,
          )
        : `Nothing to backfill — every certificate has a verify_code (${stamped?.length ?? 0} sampled row(s) re-derived clean).`,
    );
    process.exit(EXIT.OK);
  }

  if (!execute) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            dryRun: true,
            pending: pending.length,
            sample: pending.slice(0, 5).map((address) => ({
              address,
              verifyCode: verifyCode(address),
            })),
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `${pending.length} certificate(s) without a verify_code. Sample:\n`,
      );
      printTable([
        ["ADDRESS", "CODE"],
        ...pending.slice(0, 5).map((address) => [address, verifyCode(address)]),
      ]);
      console.log("\nRe-run with --execute to write.");
    }
    process.exit(EXIT.FINDINGS);
  }

  let written = 0;
  const failures: string[] = [];
  for (const address of pending) {
    // Re-asserting `verify_code is null` makes the write idempotent against a
    // concurrent run or a re-run after a partial failure.
    const { error } = await safeSupabase(() =>
      admin
        .from("certificates")
        .update({ verify_code: verifyCode(address) })
        .eq("address", address)
        .is("verify_code", null)
        .select("address"),
    );
    if (error) {
      failures.push(`${address}: ${error.message}`);
    } else {
      written++;
    }
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: failures.length === 0,
          pending: pending.length,
          written,
          failures,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Wrote ${written}/${pending.length} verify code(s).`);
    for (const failure of failures) console.error(`  FAILED ${failure}`);
  }
  process.exit(failures.length === 0 ? EXIT.OK : EXIT.FINDINGS);
}

main().catch((err: unknown) => {
  console.error(
    "backfill-verify-codes FAILED:",
    err instanceof Error ? err.message : err,
  );
  process.exit(EXIT.ERROR);
});
