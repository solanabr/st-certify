/**
 * Deletes expired attendance_nonces rows (SIWS-style wallet-proof
 * challenges, 5-minute TTL — see attendance-mutations.ts#createNonce). The
 * table has no cleanup job; this is plain hygiene against unbounded growth,
 * not an incident by itself. Nonce values themselves are never printed
 * (single-use, already-expired by the time this touches them — nothing
 * sensitive left to mask).
 *
 * Usage:
 *   npx tsx scripts/admin/nonce-sweep.ts [--older-than 24] [--execute] [--json]
 *
 * Defaults to dry-run (counts only). --execute deletes.
 *
 * Exit codes: 0 nothing to sweep, 1 expired rows found (dry-run) or delete
 * failed (--execute), 2 couldn't run the check.
 */

import {
  EXIT,
  buildSupabaseAdmin,
  getFlagNumber,
  hasFlag,
  hoursAgoIso,
  loadRootEnv,
  printHelpAndExit,
  safeSupabase,
  safeSupabaseCount,
} from "./_shared.js";

const HELP = `
nonce-sweep — delete expired attendance_nonces rows.

Usage:
  npx tsx scripts/admin/nonce-sweep.ts [options]

Options:
  --older-than <hours>   Delete nonces whose expires_at is older than this
                          many hours ago (default: 24)
  --execute               Actually delete (default: dry-run, counts only)
  --json                  Machine-readable output
  -h, --help              Show this help

Exit codes: 0 nothing to sweep, 1 expired rows found (dry-run) or delete
failed (--execute), 2 couldn't run the check.
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "-h", "--help")) printHelpAndExit(HELP);
  loadRootEnv();

  const json = hasFlag(argv, "--json");
  const execute = hasFlag(argv, "--execute");
  const olderThanHours = getFlagNumber(argv, "older-than", 24);
  const cutoff = hoursAgoIso(olderThanHours);

  const { admin, missingEnv } = buildSupabaseAdmin();
  if (!admin) {
    console.error(
      `ERROR: Supabase not configured — missing ${missingEnv.join(", ")}`,
    );
    process.exit(EXIT.ERROR);
  }

  const { count, error: countError } = await safeSupabaseCount(() =>
    admin
      .from("attendance_nonces")
      .select("nonce", { count: "exact", head: true })
      .lt("expires_at", cutoff),
  );
  if (countError) {
    console.error(`ERROR: ${countError.message}`);
    process.exit(EXIT.ERROR);
  }
  const found = count ?? 0;

  if (found === 0) {
    console.log(
      json
        ? JSON.stringify({ ok: true, found: 0, deleted: 0 }, null, 2)
        : `No expired nonces older than ${olderThanHours}h.`,
    );
    process.exit(EXIT.OK);
  }

  if (!execute) {
    console.log(
      json
        ? JSON.stringify({ ok: false, dryRun: true, found }, null, 2)
        : `${found} expired nonce(s) older than ${olderThanHours}h. Re-run with --execute to delete.`,
    );
    process.exit(EXIT.FINDINGS);
  }

  const { error: deleteError } = await safeSupabase(() =>
    admin
      .from("attendance_nonces")
      .delete()
      .lt("expires_at", cutoff)
      .select("nonce"),
  );
  if (deleteError) {
    console.error(`ERROR: delete failed — ${deleteError.message}`);
    process.exit(EXIT.ERROR);
  }

  console.log(
    json
      ? JSON.stringify({ ok: true, found, deleted: found }, null, 2)
      : `Deleted ${found} expired nonce(s).`,
  );
  process.exit(EXIT.OK);
}

main().catch((err: unknown) => {
  console.error(
    "nonce-sweep FAILED:",
    err instanceof Error ? err.message : err,
  );
  process.exit(EXIT.ERROR);
});
