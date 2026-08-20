/**
 * [ops-2] CLI kill-switch for an attendance event, for when the creator
 * dashboard isn't reachable. Mirrors the dashboard's own pause/resume/rotate
 * actions (apps/web/lib/attendance/schemas.ts, attendance-mutations.ts).
 *
 * Subcommands:
 *   pause <eventId>          claim_open -> false
 *   resume <eventId>         claim_open -> true
 *   rotate-token <eventId>   claim_token -> a newly generated token
 *                            (invalidates the old claim link immediately)
 *   invalidate <eventId>     pause + rotate-token together
 *
 * Token handling: the OLD token is always masked (it's being retired — no
 * operational value in seeing it in full, and it's still technically live
 * until this command's write commits). The NEW token is the actual
 * deliverable of rotate-token/invalidate and is printed in FULL on
 * --execute — the operator needs it verbatim to rebuild the /attend/<token>
 * link and re-share it with legitimate attendees. In dry-run, no real token
 * is generated at all (nothing to reveal or mask — see below).
 *
 * Usage:
 *   npx tsx scripts/admin/event-control.ts <pause|resume|rotate-token|invalidate> <eventId> [--execute] [--json]
 *
 * Defaults to dry-run. --execute writes.
 *
 * Exit codes: 0 OK, 2 bad args / event not found / write failed.
 */

import { randomBytes } from "node:crypto";
import {
  EXIT,
  buildSupabaseAdmin,
  hasFlag,
  loadRootEnv,
  maskToken,
  positionals,
  printHelpAndExit,
  safeSupabase,
} from "./_shared.js";

const HELP = `
event-control — pause / resume / rotate-token / invalidate an attendance event.

Usage:
  npx tsx scripts/admin/event-control.ts <action> <eventId> [options]

Actions:
  pause <eventId>          Close claims (claim_open = false)
  resume <eventId>         Re-open claims (claim_open = true)
  rotate-token <eventId>   Generate a new claim_token (invalidates the old link)
  invalidate <eventId>     pause + rotate-token together

Options:
  --execute    Actually write (default: dry-run, prints intended change only)
  --json       Machine-readable output
  -h, --help   Show this help

The old claim_token is always masked. The new one prints in FULL on
--execute (you need it to rebuild the /attend/<token> link) — dry-run never
generates a real token, so there's nothing to reveal.

Exit codes: 0 OK, 2 bad args / event not found / write failed.
`;

interface EventRow {
  id: string;
  name: string;
  claim_open: boolean;
  claim_token: string;
}

/** Mirrors apps/web/lib/attendance/token.ts#generateClaimToken exactly. */
function generateClaimToken(): string {
  return randomBytes(16).toString("base64url");
}

const ACTIONS = ["pause", "resume", "rotate-token", "invalidate"] as const;
type Action = (typeof ACTIONS)[number];

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "-h", "--help")) printHelpAndExit(HELP);
  loadRootEnv();

  const json = hasFlag(argv, "--json");
  const execute = hasFlag(argv, "--execute");
  const [action, eventId] = positionals(argv, []);

  if (!action || !ACTIONS.includes(action as Action)) {
    console.error(
      `ERROR: first argument must be one of: ${ACTIONS.join(", ")}\n`,
    );
    printHelpAndExit(HELP);
  }
  if (!eventId) {
    console.error("ERROR: missing <eventId>.\n");
    printHelpAndExit(HELP);
  }

  const { admin, missingEnv } = buildSupabaseAdmin();
  if (!admin) {
    console.error(
      `ERROR: Supabase not configured — missing ${missingEnv.join(", ")}`,
    );
    process.exit(EXIT.ERROR);
  }

  const { data: event, error: fetchError } = await safeSupabase(() =>
    admin
      .from("attendance_events")
      .select("id, name, claim_open, claim_token")
      .eq("id", eventId)
      .maybeSingle(),
  );
  if (fetchError) {
    console.error(`ERROR: ${fetchError.message}`);
    process.exit(EXIT.ERROR);
  }
  if (!event) {
    console.error(`ERROR: event ${eventId} not found.`);
    process.exit(EXIT.ERROR);
  }
  const row = event as EventRow;

  const willPause = action === "pause" || action === "invalidate";
  const willResume = action === "resume";
  const willRotate = action === "rotate-token" || action === "invalidate";

  const patch: Partial<Pick<EventRow, "claim_open" | "claim_token">> = {};
  if (willPause) patch.claim_open = false;
  if (willResume) patch.claim_open = true;
  const newToken = willRotate ? generateClaimToken() : null;
  if (newToken) patch.claim_token = newToken;

  if (!execute) {
    const preview = {
      ok: true,
      dryRun: true,
      action,
      event: { id: row.id, name: row.name, claim_open: row.claim_open },
      wouldSet: {
        ...(willPause || willResume ? { claim_open: patch.claim_open } : {}),
        ...(willRotate
          ? { claim_token: "(new token generated on --execute)" }
          : {}),
      },
    };
    if (json) {
      console.log(JSON.stringify(preview, null, 2));
    } else {
      console.log(
        `== DRY RUN — ${action} on event "${row.name}" (${row.id}) ==\n`,
      );
      console.log(`  current claim_open: ${row.claim_open}`);
      console.log(`  current claim_token: ${maskToken(row.claim_token)}`);
      if (willPause || willResume)
        console.log(`  -> claim_open would become: ${patch.claim_open}`);
      if (willRotate)
        console.log(
          `  -> claim_token would be rotated (new value generated on --execute)`,
        );
      console.log(`\nRe-run with --execute to apply.`);
    }
    process.exit(EXIT.OK);
  }

  const { data: updated, error: updateError } = await safeSupabase(() =>
    admin
      .from("attendance_events")
      .update(patch)
      .eq("id", eventId)
      .select("id, name, claim_open, claim_token")
      .single(),
  );
  if (updateError) {
    console.error(`ERROR: write failed — ${updateError.message}`);
    process.exit(EXIT.ERROR);
  }
  if (!updated) {
    console.error("ERROR: write reported no error but returned no row.");
    process.exit(EXIT.ERROR);
  }
  const after = updated as EventRow;

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          action,
          event: {
            id: after.id,
            name: after.name,
            claim_open: after.claim_open,
          },
          oldClaimTokenMasked: maskToken(row.claim_token),
          newClaimToken: newToken, // full value — this is the deliverable
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `== ${action} applied to event "${after.name}" (${after.id}) ==\n`,
    );
    console.log(`  claim_open: ${after.claim_open}`);
    if (newToken) {
      console.log(`  old claim_token (retired): ${maskToken(row.claim_token)}`);
      console.log(
        `\n  NEW claim_token — copy this, it will not be shown again:`,
      );
      console.log(`  ${newToken}`);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (appUrl)
        console.log(`  ${appUrl.replace(/\/$/, "")}/attend/${newToken}`);
    }
  }

  process.exit(EXIT.OK);
}

main().catch((err: unknown) => {
  console.error(
    "event-control FAILED:",
    err instanceof Error ? err.message : err,
  );
  process.exit(EXIT.ERROR);
});
