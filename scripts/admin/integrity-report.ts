/**
 * [att-1] Read-only reconciliation / double-mint triage tool. Per event (or
 * all events), checks:
 *
 *   1. minted_count desync — attendance_events.minted_count must equal
 *      count(claims where status in ('pending','minted')) for that event.
 *      This is the documented invariant (0002_attendance.sql header
 *      comment): minted_count tracks *reserved capacity*, not just
 *      confirmed mints, so a 'pending' claim still counts.
 *   2. claims marked 'minted' with no tx_sig — should never happen;
 *      markClaimMinted always sets both together.
 *   3. duplicate tx_sig or asset_id across >1 claim row — a double-mint
 *      or bookkeeping-race signal.
 *   4. duplicate (event_id, wallet) rows — the DB has a unique constraint
 *      on this pair; flagged anyway as defense in depth.
 *   5. stuck reservations — 'pending' claims whose reserved_at is older
 *      than --stuck-after minutes (informational cousin of
 *      reserve-sweep.ts, which actually releases them).
 *
 * Also reports (informational, not a hard anomaly) claims minted with no
 * asset_id yet — expected/normal, since resolveAttendanceAssetId is
 * best-effort and only resolves after finalization (lib/chain/attendance.ts).
 *
 * Usage:
 *   npx tsx scripts/admin/integrity-report.ts [--event <id>] [--stuck-after 2] [--json]
 *
 * Read-only. Exit codes: 0 clean, 1 anomalies found, 2 couldn't run the check.
 */

import {
  EXIT,
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
integrity-report — reconcile attendance_events/attendance_claims, flag double-mint signals.

Usage:
  npx tsx scripts/admin/integrity-report.ts [options]

Options:
  --event <id>          Only check this event (default: all events)
  --stuck-after <min>    Age past which a pending reservation is flagged as
                         "stuck" (default: 2 — past the SQL 90s in-flight window)
  --json                 Machine-readable output
  -h, --help             Show this help

Read-only. Exit codes: 0 clean, 1 anomalies found, 2 couldn't run the check.
`;

interface EventRow {
  id: string;
  name: string;
  minted_count: number;
  max_supply: number | null;
}

interface ClaimRow {
  id: string;
  event_id: string;
  wallet: string;
  status: "pending" | "minted" | "failed";
  reserved_at: string | null;
  tx_sig: string | null;
  asset_id: string | null;
}

interface Anomaly {
  kind: string;
  eventId: string;
  detail: string;
}

function findDuplicates<T>(
  items: T[],
  key: (item: T) => string | null,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const bucket = groups.get(k) ?? [];
    bucket.push(item);
    groups.set(k, bucket);
  }
  for (const [k, bucket] of groups) if (bucket.length < 2) groups.delete(k);
  return groups;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "-h", "--help")) printHelpAndExit(HELP);
  loadRootEnv();

  const json = hasFlag(argv, "--json");
  const eventFilter = getFlagValue(argv, "event");
  const stuckAfterMinutes = getFlagNumber(argv, "stuck-after", 2);
  const stuckCutoff = minutesAgoIso(stuckAfterMinutes);

  const { admin, missingEnv } = buildSupabaseAdmin();
  if (!admin) {
    console.error(
      `ERROR: Supabase not configured — missing ${missingEnv.join(", ")}`,
    );
    process.exit(EXIT.ERROR);
  }

  let eventsQuery = admin
    .from("attendance_events")
    .select("id, name, minted_count, max_supply");
  if (eventFilter) eventsQuery = eventsQuery.eq("id", eventFilter);
  const { data: eventsData, error: eventsError } = await safeSupabase(
    () => eventsQuery,
  );
  if (eventsError) {
    console.error(`ERROR: ${eventsError.message}`);
    process.exit(EXIT.ERROR);
  }
  const events = (eventsData ?? []) as EventRow[];
  if (eventFilter && events.length === 0) {
    console.error(`ERROR: event ${eventFilter} not found.`);
    process.exit(EXIT.ERROR);
  }
  if (events.length === 0) {
    console.log(
      json
        ? JSON.stringify({ ok: true, events: 0, anomalies: [] })
        : "No events to check.",
    );
    process.exit(EXIT.OK);
  }

  const eventIds = events.map((e) => e.id);
  const { data: claimsData, error: claimsError } = await safeSupabase(() =>
    admin
      .from("attendance_claims")
      .select("id, event_id, wallet, status, reserved_at, tx_sig, asset_id")
      .in("event_id", eventIds),
  );
  if (claimsError) {
    console.error(`ERROR: ${claimsError.message}`);
    process.exit(EXIT.ERROR);
  }
  const claims = (claimsData ?? []) as ClaimRow[];

  const anomalies: Anomaly[] = [];
  const claimsByEvent = new Map<string, ClaimRow[]>();
  for (const c of claims)
    claimsByEvent.set(c.event_id, [
      ...(claimsByEvent.get(c.event_id) ?? []),
      c,
    ]);

  const summaryRows: string[][] = [
    ["event", "minted_count", "expected", "pending", "minted", "failed"],
  ];
  for (const event of events) {
    const eventClaims = claimsByEvent.get(event.id) ?? [];
    const byStatus = { pending: 0, minted: 0, failed: 0 };
    for (const c of eventClaims) byStatus[c.status]++;
    const expected = byStatus.pending + byStatus.minted;

    summaryRows.push([
      event.id,
      String(event.minted_count),
      String(expected),
      String(byStatus.pending),
      String(byStatus.minted),
      String(byStatus.failed),
    ]);

    if (expected !== event.minted_count) {
      anomalies.push({
        kind: "minted_count_desync",
        eventId: event.id,
        detail: `event.minted_count=${event.minted_count} but pending+minted claims=${expected}`,
      });
    }

    for (const c of eventClaims) {
      if (c.status === "minted" && !c.tx_sig) {
        anomalies.push({
          kind: "minted_without_tx_sig",
          eventId: event.id,
          detail: `claim ${c.id} wallet=${c.wallet}`,
        });
      }
      if (
        c.status === "pending" &&
        c.reserved_at &&
        c.reserved_at < stuckCutoff
      ) {
        anomalies.push({
          kind: "stuck_reservation",
          eventId: event.id,
          detail: `claim ${c.id} wallet=${c.wallet} reserved_at=${c.reserved_at}`,
        });
      }
    }
  }

  // Cross-event checks (double-mint signals + the unique-constraint sanity check).
  for (const [txSig, group] of findDuplicates(claims, (c) => c.tx_sig)) {
    anomalies.push({
      kind: "duplicate_tx_sig",
      eventId: group[0].event_id,
      detail: `tx_sig=${txSig} used by ${group.length} claims: ${group.map((c) => c.id).join(", ")}`,
    });
  }
  for (const [assetId, group] of findDuplicates(claims, (c) => c.asset_id)) {
    anomalies.push({
      kind: "duplicate_asset_id",
      eventId: group[0].event_id,
      detail: `asset_id=${assetId} used by ${group.length} claims: ${group.map((c) => c.id).join(", ")}`,
    });
  }
  for (const [pair, group] of findDuplicates(
    claims,
    (c) => `${c.event_id}:${c.wallet}`,
  )) {
    anomalies.push({
      kind: "duplicate_event_wallet",
      eventId: group[0].event_id,
      detail: `(event,wallet)=${pair} has ${group.length} claim rows: ${group.map((c) => c.id).join(", ")}`,
    });
  }

  const mintedWithoutAssetId = claims.filter(
    (c) => c.status === "minted" && !c.asset_id,
  ).length;

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: anomalies.length === 0,
          events: events.length,
          anomalies,
          mintedWithoutAssetId,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("== Per-event summary ==\n");
    printTable(summaryRows);
    console.log(
      `\n(minted_count invariant: it counts pending+minted claims, i.e. reserved capacity — not just confirmed mints.)`,
    );

    if (anomalies.length === 0) {
      console.log("\nNo anomalies found.");
    } else {
      console.log(
        `\n== ${anomalies.length} anomal${anomalies.length === 1 ? "y" : "ies"} ==\n`,
      );
      printTable([
        ["kind", "event", "detail"],
        ...anomalies.map((a) => [a.kind, a.eventId, a.detail]),
      ]);
    }
    console.log(
      `\nInformational: ${mintedWithoutAssetId} minted claim(s) with no asset_id yet (normal — resolution is best-effort/async).`,
    );
  }

  process.exit(anomalies.length > 0 ? EXIT.FINDINGS : EXIT.OK);
}

main().catch((err: unknown) => {
  console.error(
    "integrity-report FAILED:",
    err instanceof Error ? err.message : err,
  );
  process.exit(EXIT.ERROR);
});
