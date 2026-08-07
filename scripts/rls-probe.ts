/**
 * RLS negative probe (M7 hardening, plan §Security #10 "Supabase RLS: all
 * client writes denied; only service-role writes the mirror"). This is a
 * security GATE, not a smoke test: it proves, against the live Supabase
 * project, that the anon key genuinely cannot write anywhere and genuinely
 * cannot read profiles/events — the same guarantee supabase/migrations/
 * 0001_init.sql declares in SQL, exercised end-to-end through PostgREST the
 * way a real attacker (or a client-side bug) would hit it.
 *
 * Design: seed known probe rows with the SERVICE-ROLE client (bypasses RLS),
 * then attempt every operation with the ANON client, then clean up with the
 * service-role client again. Seed-then-probe (rather than trusting an empty
 * table) is deliberate: for SELECT, RLS-with-no-policy doesn't error, it
 * silently returns zero rows — indistinguishable from "table is empty"
 * unless we first prove a row that SHOULD be denied actually exists.
 *
 * For UPDATE/DELETE, Postgres RLS-with-no-policy also doesn't error — the
 * row is invisible to the command, so it just affects zero rows. For INSERT,
 * a missing WITH CHECK policy does throw. This script treats "an explicit
 * error" OR "zero rows affected" as PASS (denied) and "the mutation visibly
 * took effect" as the only FAIL — covering both manifestations without
 * hard-coding which one PostgREST will produce for a given case.
 *
 * Idempotent + non-destructive to real data: every probe row's PK is
 * prefixed with a run-scoped marker and is deleted in a `finally` block,
 * including any row that leaked through an unexpected INSERT success.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile();
} catch {
  // No .env file found — assume the environment is already configured.
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const RUN_ID = `rlsprobe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

type Verdict = "PASS" | "FAIL" | "ERROR";

interface ProbeResult {
  table: string;
  op: "select-allowed" | "select-denied" | "insert" | "update" | "delete";
  verdict: Verdict;
  detail: string;
}

const results: ProbeResult[] = [];

function record(
  table: string,
  op: ProbeResult["op"],
  verdict: Verdict,
  detail: string,
): void {
  results.push({ table, op, verdict, detail });
}

/** A mutation is "denied" whether PostgREST returns an explicit error OR
 * silently affects zero rows (both are valid RLS-deny manifestations — see
 * file header). Returns the row count actually touched, for the caller to
 * decide pass/fail against what it expected. */
async function attempt(
  promise: PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>,
): Promise<{ blocked: boolean; detail: string }> {
  const { data, error } = await promise;
  if (error) return { blocked: true, detail: `error: ${error.message}` };
  const count = data?.length ?? 0;
  if (count === 0) return { blocked: true, detail: "0 rows affected" };
  return { blocked: false, detail: `${count} row(s) affected — NOT BLOCKED` };
}

async function main(): Promise<void> {
  if (!URL || !ANON_KEY || !SERVICE_KEY) {
    console.log("skipped — set NEXT_PUBLIC_SUPABASE_URL");
    return;
  }

  const admin: SupabaseClient = createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const anon: SupabaseClient = createClient(URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  const editionAddress = `${RUN_ID}_edition`;
  const editionAddressInsertAttempt = `${RUN_ID}_edition_insert`;
  const certAddress = `${RUN_ID}_cert`;
  const certAddressInsertAttempt = `${RUN_ID}_cert_insert`;
  const did = `${RUN_ID}_did`;
  const didInsertAttempt = `${RUN_ID}_did_insert`;
  let eventId: number | null = null;
  let eventInsertAttemptId: number | null = null;

  console.log(`== RLS probe (run ${RUN_ID}) ==\n`);

  // ---------------------------------------------------------------------
  // Setup: seed one known row per table with the service-role client.
  // ---------------------------------------------------------------------
  console.log("Seeding probe rows (service role)...");
  {
    const { error } = await admin.from("editions").insert({
      address: editionAddress,
      slug: `${RUN_ID}-edition`,
      name: "RLS probe edition",
      max_supply: 10,
      status: "paused",
    });
    if (error)
      throw new Error(`setup: editions insert failed: ${error.message}`);
  }
  {
    const { error } = await admin.from("edition_signers").insert({
      edition_address: editionAddress,
      position: 0,
      wallet: `${RUN_ID}_signer_wallet`,
      name: "Probe Signer",
    });
    if (error)
      throw new Error(`setup: edition_signers insert failed: ${error.message}`);
  }
  {
    const { error } = await admin.from("certificates").insert({
      address: certAddress,
      edition_address: editionAddress,
      student_name: "RLS Probe Student",
      status: "Requested",
    });
    if (error)
      throw new Error(`setup: certificates insert failed: ${error.message}`);
  }
  {
    const { error } = await admin.from("profiles").insert({
      did,
      email: "rls-probe@example.invalid",
    });
    if (error)
      throw new Error(`setup: profiles insert failed: ${error.message}`);
  }
  {
    const { data, error } = await admin
      .from("events")
      .insert({ type: "rls_probe_seed", actor: did })
      .select("id")
      .single();
    if (error || !data)
      throw new Error(`setup: events insert failed: ${error?.message}`);
    eventId = (data as { id: number }).id;
  }
  console.log("Seed complete.\n");

  try {
    // -------------------------------------------------------------------
    // SELECT — public tables must be readable by anon.
    // -------------------------------------------------------------------
    for (const [table, match] of [
      ["editions", { address: editionAddress }],
      ["edition_signers", { edition_address: editionAddress }],
      ["certificates", { address: certAddress }],
    ] as const) {
      const { data, error } = await anon.from(table).select("*").match(match);
      if (error) {
        record(
          table,
          "select-allowed",
          "FAIL",
          `anon SELECT errored: ${error.message}`,
        );
      } else if (!data || data.length === 0) {
        record(
          table,
          "select-allowed",
          "FAIL",
          "anon SELECT returned 0 rows for a row known to exist",
        );
      } else {
        record(
          table,
          "select-allowed",
          "PASS",
          `visible (${data.length} row(s))`,
        );
      }
    }

    // SELECT — profiles/events must be INVISIBLE to anon (RLS, no policy).
    {
      const { data, error } = await anon
        .from("profiles")
        .select("*")
        .eq("did", did);
      if (error) {
        record(
          "profiles",
          "select-denied",
          "PASS",
          `anon SELECT errored (denied): ${error.message}`,
        );
      } else if (data && data.length > 0) {
        record(
          "profiles",
          "select-denied",
          "FAIL",
          `anon SELECT returned the row — NOT DENIED`,
        );
      } else {
        record(
          "profiles",
          "select-denied",
          "PASS",
          "0 rows returned (RLS-hidden)",
        );
      }
    }
    {
      const { data, error } = await anon
        .from("events")
        .select("*")
        .eq("id", eventId as number);
      if (error) {
        record(
          "events",
          "select-denied",
          "PASS",
          `anon SELECT errored (denied): ${error.message}`,
        );
      } else if (data && data.length > 0) {
        record(
          "events",
          "select-denied",
          "FAIL",
          `anon SELECT returned the row — NOT DENIED`,
        );
      } else {
        record(
          "events",
          "select-denied",
          "PASS",
          "0 rows returned (RLS-hidden)",
        );
      }
    }

    // -------------------------------------------------------------------
    // INSERT — anon must be unable to create a row in any of the 5 tables.
    // -------------------------------------------------------------------
    {
      const r = await attempt(
        anon
          .from("editions")
          .insert({
            address: editionAddressInsertAttempt,
            slug: `${RUN_ID}-edition-insert`,
            name: "RLS probe insert attempt",
            max_supply: 1,
          })
          .select(),
      );
      record("editions", "insert", r.blocked ? "PASS" : "FAIL", r.detail);
    }
    {
      const r = await attempt(
        anon
          .from("edition_signers")
          .insert({
            edition_address: editionAddress,
            position: 1,
            wallet: `${RUN_ID}_signer_wallet_insert`,
            name: "Probe Signer Insert Attempt",
          })
          .select(),
      );
      record(
        "edition_signers",
        "insert",
        r.blocked ? "PASS" : "FAIL",
        r.detail,
      );
    }
    {
      const r = await attempt(
        anon
          .from("certificates")
          .insert({
            address: certAddressInsertAttempt,
            edition_address: editionAddress,
            student_name: "RLS Probe Insert Attempt",
            status: "Requested",
          })
          .select(),
      );
      record("certificates", "insert", r.blocked ? "PASS" : "FAIL", r.detail);
    }
    {
      const r = await attempt(
        anon
          .from("profiles")
          .insert({
            did: didInsertAttempt,
            email: "rls-probe-insert@example.invalid",
          })
          .select(),
      );
      record("profiles", "insert", r.blocked ? "PASS" : "FAIL", r.detail);
    }
    {
      const r = await attempt(
        anon
          .from("events")
          .insert({ type: "rls_probe_insert_attempt" })
          .select(),
      );
      record("events", "insert", r.blocked ? "PASS" : "FAIL", r.detail);
      // Track a leaked id for cleanup, if the insert unexpectedly worked.
      if (!r.blocked) {
        const { data } = await admin
          .from("events")
          .select("id")
          .eq("type", "rls_probe_insert_attempt")
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        eventInsertAttemptId = (data as { id: number } | null)?.id ?? null;
      }
    }

    // -------------------------------------------------------------------
    // UPDATE — anon must be unable to modify the seeded row in any table.
    // -------------------------------------------------------------------
    for (const [table, match, patch] of [
      ["editions", { address: editionAddress }, { name: "TAMPERED" }],
      [
        "edition_signers",
        { edition_address: editionAddress, position: 0 },
        { name: "TAMPERED" },
      ],
      ["certificates", { address: certAddress }, { student_name: "TAMPERED" }],
      ["profiles", { did }, { email: "tampered@example.invalid" }],
      ["events", { id: eventId as number }, { type: "tampered" }],
    ] as const) {
      const r = await attempt(
        anon.from(table).update(patch).match(match).select(),
      );
      record(table, "update", r.blocked ? "PASS" : "FAIL", r.detail);
    }

    // -------------------------------------------------------------------
    // DELETE — anon must be unable to remove the seeded row in any table.
    // Run last (destructive); order among these 5 doesn't matter further.
    // -------------------------------------------------------------------
    for (const [table, match] of [
      ["edition_signers", { edition_address: editionAddress, position: 0 }],
      ["certificates", { address: certAddress }],
      ["editions", { address: editionAddress }],
      ["profiles", { did }],
      ["events", { id: eventId as number }],
    ] as const) {
      const r = await attempt(anon.from(table).delete().match(match).select());
      record(table, "delete", r.blocked ? "PASS" : "FAIL", r.detail);
    }
  } finally {
    console.log("\nCleaning up probe rows (service role)...");
    // Deleting the edition cascades to edition_signers + certificates
    // (0001_init.sql: `on delete cascade`). Each delete tolerates the row
    // already being gone (e.g. if a DELETE probe above unexpectedly
    // succeeded) — cleanup must never throw on top of a real finding.
    await admin.from("editions").delete().eq("address", editionAddress);
    await admin
      .from("editions")
      .delete()
      .eq("address", editionAddressInsertAttempt);
    await admin
      .from("certificates")
      .delete()
      .eq("address", certAddressInsertAttempt);
    await admin.from("profiles").delete().eq("did", did);
    await admin.from("profiles").delete().eq("did", didInsertAttempt);
    if (eventId !== null) await admin.from("events").delete().eq("id", eventId);
    if (eventInsertAttemptId !== null) {
      await admin.from("events").delete().eq("id", eventInsertAttemptId);
    }
    console.log("Cleanup complete.");
  }

  // -----------------------------------------------------------------------
  // Report
  // -----------------------------------------------------------------------
  console.log("\n== Results ==");
  const width = Math.max(...results.map((r) => r.table.length)) + 2;
  for (const r of results) {
    const badge = r.verdict === "PASS" ? "PASS" : "FAIL";
    console.log(
      `[${badge}] ${r.table.padEnd(width)} ${r.op.padEnd(16)} ${r.detail}`,
    );
  }

  const failures = results.filter((r) => r.verdict !== "PASS");
  console.log(
    `\n${results.length - failures.length}/${results.length} checks passed.`,
  );
  if (failures.length > 0) {
    console.error(
      `\n${failures.length} RLS check(s) FAILED — anon key can do something it should not be able to do. Fix supabase/migrations/0001_init.sql before shipping.`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nAll RLS checks passed — anon key is correctly locked down.");
  }
}

main().catch((error: unknown) => {
  console.error("rls-probe FAILED (setup/infra error, not a finding):", error);
  process.exitCode = 1;
});
