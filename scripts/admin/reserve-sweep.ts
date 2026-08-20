/**
 * [att-3] Finds stale attendance_claims reservations — rows still `pending`
 * whose `reserved_at` is older than --max-age minutes — and releases them
 * via attendance_release_claim (marks `failed`, frees the event's capacity
 * slot). "Stale" here means well past the SQL function's own 90s in-flight
 * window (0002_attendance.sql): a wallet that retries within 90s gets
 * 'retry' automatically and needs no admin action. This script is for
 * reservations nobody ever came back to retry — abandoned mid-claim,
 * silently holding a capacity slot on the 16,384-leaf tree forever
 * otherwise.
 *
 * Usage:
 *   npx tsx scripts/admin/reserve-sweep.ts [--max-age 5] [--event <id>] [--execute] [--json]
 *
 * Defaults to dry-run (lists what would be released). --execute writes.
 *
 * Exit codes: 0 nothing stale, 1 stale reservations found (dry-run) or some
 * releases failed (--execute), 2 couldn't run the check (Supabase unreachable).
 */

import {
  EXIT,
  RESERVATION_IN_FLIGHT_SECONDS,
  buildSupabaseAdmin,
  getFlagNumber,
  getFlagValue,
  hasFlag,
  loadRootEnv,
  minutesAgoIso,
  printHelpAndExit,
  printTable,
  safeSupabase,
} from "./_shared.js";

const HELP = `
reserve-sweep — find (and optionally release) stale attendance claim reservations.

Usage:
  npx tsx scripts/admin/reserve-sweep.ts [options]

Options:
  --max-age <minutes>   Reservation age past which it's considered abandoned
                         (default: 5 — comfortably past the SQL function's
                         own 90s in-flight window, so it never races a
                         legitimate retry)
  --event <id>          Only sweep this event
  --execute             Actually release (default: dry-run, lists only)
  --json                Machine-readable output
  -h, --help            Show this help

Exit codes: 0 nothing stale, 1 stale reservations found (dry-run) or some
releases failed (--execute), 2 couldn't run the check.
`;

interface StaleClaim {
  id: string;
  event_id: string;
  wallet: string;
  reserved_at: string;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "-h", "--help")) printHelpAndExit(HELP);
  loadRootEnv();

  const json = hasFlag(argv, "--json");
  const execute = hasFlag(argv, "--execute");
  const maxAgeMinutes = getFlagNumber(argv, "max-age", 5);
  const eventFilter = getFlagValue(argv, "event");
  const cutoff = minutesAgoIso(maxAgeMinutes);

  if (maxAgeMinutes * 60 < RESERVATION_IN_FLIGHT_SECONDS) {
    console.error(
      `ERROR: --max-age ${maxAgeMinutes}m is shorter than the SQL in-flight window ` +
        `(${RESERVATION_IN_FLIGHT_SECONDS}s) — this would race legitimate retries. Refusing to run.`,
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

  let query = admin
    .from("attendance_claims")
    .select("id, event_id, wallet, reserved_at")
    .eq("status", "pending")
    .lt("reserved_at", cutoff)
    .order("reserved_at", { ascending: true });
  if (eventFilter) query = query.eq("event_id", eventFilter);

  const { data, error } = await safeSupabase(() => query);
  if (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(EXIT.ERROR);
  }

  const stale = (data ?? []) as StaleClaim[];

  if (stale.length === 0) {
    if (json) {
      console.log(JSON.stringify({ ok: true, found: 0, released: 0 }, null, 2));
    } else {
      console.log(`No stale reservations older than ${maxAgeMinutes}m.`);
    }
    process.exit(EXIT.OK);
  }

  const perEvent = new Map<string, number>();
  for (const c of stale)
    perEvent.set(c.event_id, (perEvent.get(c.event_id) ?? 0) + 1);

  if (!execute) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            dryRun: true,
            found: stale.length,
            claims: stale,
            perEvent: Object.fromEntries(perEvent),
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `== ${stale.length} stale reservation(s) (dry-run, --max-age ${maxAgeMinutes}m) ==\n`,
      );
      printTable([
        ["claim_id", "event_id", "wallet", "reserved_at"],
        ...stale.map((c) => [c.id, c.event_id, c.wallet, c.reserved_at]),
      ]);
      console.log("\nPer event:");
      for (const [eventId, count] of perEvent)
        console.log(`  ${eventId}: ${count}`);
      console.log(`\nRe-run with --execute to release these slots.`);
    }
    process.exit(EXIT.FINDINGS);
  }

  let released = 0;
  let failed = 0;
  const failures: { id: string; error: string }[] = [];
  for (const claim of stale) {
    const { error: releaseError } = await safeSupabase(() =>
      admin.rpc("attendance_release_claim", { p_claim_id: claim.id }),
    );
    if (releaseError) {
      failed++;
      failures.push({ id: claim.id, error: releaseError.message });
    } else {
      released++;
    }
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: failed === 0,
          found: stale.length,
          released,
          failed,
          failures,
          perEvent: Object.fromEntries(perEvent),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `== Released ${released}/${stale.length} stale reservation(s) ==\n`,
    );
    console.log("Freed slots per event:");
    for (const [eventId, count] of perEvent)
      console.log(`  ${eventId}: up to ${count}`);
    if (failures.length > 0) {
      console.log(`\n${failed} release(s) FAILED:`);
      for (const f of failures) console.log(`  ${f.id}: ${f.error}`);
    }
  }

  process.exit(failed > 0 ? EXIT.FINDINGS : EXIT.OK);
}

main().catch((err: unknown) => {
  console.error(
    "reserve-sweep FAILED:",
    err instanceof Error ? err.message : err,
  );
  process.exit(EXIT.ERROR);
});
