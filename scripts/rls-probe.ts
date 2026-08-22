/**
 * RLS negative probe (M7 hardening, plan §Security #10 "Supabase RLS: all
 * client writes denied; only service-role writes the mirror"). This is a
 * security GATE, not a smoke test: it proves, against the live Supabase
 * project, that the anon key genuinely cannot write anywhere, genuinely
 * cannot read profiles, events, the attendance tables or the overhaul
 * tables, genuinely cannot read the withheld columns of `certificates`,
 * and genuinely cannot
 * call the attendance RPCs or write to storage — the same guarantees
 * supabase/migrations/0001_init.sql, 0002_attendance.sql, 0003_hardening.sql
 * and 0005_overhaul.sql declare in SQL, exercised end-to-end through PostgREST
 * the way a real attacker (or a client-side bug) would hit it.
 *
 * Design: seed known probe rows with the SERVICE-ROLE client (bypasses RLS),
 * then attempt every operation with the ANON client, then clean up with the
 * service-role client again. `edition_drafts`/`signer_invites`/
 * `notification_log` get a second pass as the `authenticated` role over the
 * Postgres connection — see `probeAuthenticatedRole` for why that half cannot
 * go through PostgREST. Seed-then-probe (rather than trusting an empty
 * table) is deliberate: for SELECT, RLS-with-no-policy doesn't error, it
 * silently returns zero rows — indistinguishable from "table is empty"
 * unless we first prove a row that SHOULD be denied actually exists. The
 * seeded certificate carries non-null name_salt/owner_did/owner_wallet for
 * the same reason: a null column reads the same as a denied one.
 *
 * For UPDATE/DELETE, Postgres RLS-with-no-policy also doesn't error — the
 * row is invisible to the command, so it just affects zero rows. For INSERT,
 * a missing WITH CHECK policy does throw. This script treats "an explicit
 * error" OR "zero rows affected" as PASS (denied) and "the mutation visibly
 * took effect" as the only FAIL — covering both manifestations without
 * hard-coding which one PostgREST will produce for a given case. RPCs are the
 * exception: a void-returning function that runs successfully also yields no
 * rows, so `attemptRpc` treats *any* absence of error as NOT BLOCKED.
 *
 * Missing env is a hard failure, not a skip: this script is the gate that
 * stands between the anon key and every student's PII, and a gate that passes
 * when it was never actually run is worse than no gate at all.
 *
 * Idempotent + non-destructive to real data: every probe row's PK is
 * prefixed with a run-scoped marker and is deleted in a `finally` block,
 * including any row that leaked through an unexpected INSERT success.
 */

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// Resolves from the repo-root install, same as scripts/setup-supabase.ts.
import { Client } from "pg";

try {
  process.loadEnvFile();
} catch {
  // No .env file found — assume the environment is already configured.
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;

const RUN_ID = `rlsprobe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * The columns 0003_hardening.sql grants anon on `certificates`, plus
 * `verify_code` from 0005_overhaul.sql. Kept in sync by hand with
 * CERT_PUBLIC_COLUMNS in apps/web/lib/db/claim-verify-queries.ts (scripts/
 * can't import across the app's `@/` path alias).
 *
 * `verify_code` earns its place here rather than being taken on trust: a
 * column-level grant covers only the columns named when it was issued, so a
 * column added by a later migration is denied until someone remembers to grant
 * it. 0005 does — and this projection is what would catch it if a future
 * migration adding a public column forgets.
 */
const CERT_PUBLIC_COLUMNS =
  "address, edition_address, student_name, status, signer_bitmap, sha256, image_url, metadata_url, asset, cert_number, signer_txs, revoke_reason, completed_at, created_at, verify_code";

/** Columns the same migration deliberately withholds from anon. */
const CERT_WITHHELD_COLUMNS = ["name_salt", "owner_did", "owner_wallet"];

const STORAGE_BUCKETS = ["templates", "certs", "metadata", "attendance"];

type Verdict = "PASS" | "FAIL" | "ERROR";

interface ProbeResult {
  table: string;
  op:
    | "select-allowed"
    | "select-denied"
    | "select-columns"
    | "insert"
    | "update"
    | "delete"
    | "rpc-denied"
    | "storage-write";
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

/** Unlike `attempt`, an RPC that returns no rows still RAN — only an explicit
 * error proves EXECUTE was denied. */
async function attemptRpc(
  promise: PromiseLike<{ error: { message: string } | null }>,
): Promise<{ blocked: boolean; detail: string }> {
  const { error } = await promise;
  if (error) return { blocked: true, detail: `error: ${error.message}` };
  return { blocked: false, detail: "function executed — NOT BLOCKED" };
}

/** A read is "denied" only via an explicit error — a column the anon role
 * lacks SELECT on makes PostgREST return a 42501, not an empty result. */
async function expectReadDenied(
  table: string,
  op: ProbeResult["op"],
  what: string,
  promise: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<void> {
  const { data, error } = await promise;
  if (error) {
    record(table, op, "PASS", `${what} denied: ${error.message}`);
    return;
  }
  record(
    table,
    op,
    "FAIL",
    `${what} returned ${JSON.stringify(data)} — NOT DENIED`,
  );
}

function requireEnv(): {
  url: string;
  anonKey: string;
  serviceKey: string;
  dbUrl: string;
} {
  const missing = (
    [
      ["NEXT_PUBLIC_SUPABASE_URL", URL],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY],
      ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
      // Required, not optional: without it the `authenticated` half of the
      // probe cannot run at all, and a gate that quietly skips half of what it
      // claims to check is the failure mode this file exists to avoid.
      ["SUPABASE_DB_URL", DB_URL],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `missing required env: ${missing.join(", ")}.\n` +
        "  This probe is a security gate — it cannot pass without running.\n" +
        "  Set these in .env (Supabase dashboard → Project Settings → API for the\n" +
        "  keys, Connect → URI for SUPABASE_DB_URL) and re-run.",
    );
  }
  return {
    url: URL as string,
    anonKey: ANON_KEY as string,
    serviceKey: SERVICE_KEY as string,
    dbUrl: DB_URL as string,
  };
}

/**
 * Runs the same four operations against the three overhaul tables as the
 * `authenticated` role, over the Postgres connection `setup-supabase.ts`
 * already uses. `SET LOCAL ROLE` drops privileges for the rest of the
 * transaction (Supabase's `postgres` is a member of `authenticated`), each
 * statement is wrapped in a SAVEPOINT so a permission error doesn't poison the
 * ones after it, and the whole thing ends in ROLLBACK — nothing here can write
 * to the project even if a check fails open.
 *
 * Verdicts follow `attempt`: an explicit error OR zero rows is denied; rows
 * coming back is the only failure.
 */
async function probeAuthenticatedRole(
  dbUrl: string,
  ids: { draftId: string; inviteId: string; notificationId: string },
): Promise<void> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");

    const confirmed = await client.query<{ role: string }>(
      "select current_user as role",
    );
    if (confirmed.rows[0]?.role !== "authenticated") {
      throw new Error(
        `expected to be running as "authenticated", got "${confirmed.rows[0]?.role}"`,
      );
    }

    const cases: Array<{
      table: string;
      op: ProbeResult["op"];
      sql: string;
      params: unknown[];
    }> = [
      {
        table: "edition_drafts",
        op: "select-denied",
        sql: "select id from edition_drafts where id = $1",
        params: [ids.draftId],
      },
      {
        table: "signer_invites",
        op: "select-denied",
        sql: "select id from signer_invites where id = $1",
        params: [ids.inviteId],
      },
      {
        table: "notification_log",
        op: "select-denied",
        sql: "select id from notification_log where id = $1",
        params: [ids.notificationId],
      },
      {
        table: "edition_drafts",
        op: "insert",
        sql: "insert into edition_drafts (meta, created_by) values ('{}'::jsonb, $1) returning id",
        params: [`${RUN_ID}_authenticated_insert`],
      },
      {
        table: "signer_invites",
        op: "insert",
        sql: "insert into signer_invites (draft_id, name, role, email, token) values ($1, 'Probe', 'Probe', 'x@example.invalid', $2) returning id",
        params: [ids.draftId, `${RUN_ID}_authenticated_token`],
      },
      {
        table: "notification_log",
        op: "insert",
        sql: "insert into notification_log (type, recipient, ref_id) values ('rls_probe_authenticated', 'x@example.invalid', $1) returning id",
        params: [`${RUN_ID}_authenticated_ref`],
      },
      {
        table: "edition_drafts",
        op: "update",
        sql: "update edition_drafts set chain_address = $2 where id = $1 returning id",
        params: [ids.draftId, `${RUN_ID}_authenticated_tamper`],
      },
      {
        table: "signer_invites",
        op: "update",
        sql: "update signer_invites set wallet = $2 where id = $1 returning id",
        params: [ids.inviteId, `${RUN_ID}_authenticated_wallet`],
      },
      {
        table: "notification_log",
        op: "update",
        sql: "update notification_log set recipient = 'tampered@example.invalid' where id = $1 returning id",
        params: [ids.notificationId],
      },
      {
        table: "signer_invites",
        op: "delete",
        sql: "delete from signer_invites where id = $1 returning id",
        params: [ids.inviteId],
      },
      {
        table: "edition_drafts",
        op: "delete",
        sql: "delete from edition_drafts where id = $1 returning id",
        params: [ids.draftId],
      },
      {
        table: "notification_log",
        op: "delete",
        sql: "delete from notification_log where id = $1 returning id",
        params: [ids.notificationId],
      },
    ];

    for (const c of cases) {
      await client.query("savepoint probe");
      try {
        const res = await client.query(c.sql, c.params);
        const count = res.rowCount ?? 0;
        record(
          `${c.table} (authenticated)`,
          c.op,
          count === 0 ? "PASS" : "FAIL",
          count === 0
            ? "0 rows (no privilege / RLS-hidden)"
            : `${count} row(s) — NOT BLOCKED`,
        );
      } catch (err) {
        record(
          `${c.table} (authenticated)`,
          c.op,
          "PASS",
          `error: ${err instanceof Error ? err.message : String(err)}`,
        );
        await client.query("rollback to savepoint probe");
      }
    }
  } finally {
    // Belt and braces: the connection is closed either way, but an explicit
    // rollback makes it impossible for a leaked statement to commit.
    await client.query("rollback").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const env = requireEnv();

  const admin: SupabaseClient = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false },
  });
  const anon: SupabaseClient = createClient(env.url, env.anonKey, {
    auth: { persistSession: false },
  });

  const editionAddress = `${RUN_ID}_edition`;
  const editionAddressInsertAttempt = `${RUN_ID}_edition_insert`;
  const certAddress = `${RUN_ID}_cert`;
  const certAddressInsertAttempt = `${RUN_ID}_cert_insert`;
  const did = `${RUN_ID}_did`;
  const didInsertAttempt = `${RUN_ID}_did_insert`;
  const ownerWallet = `${RUN_ID}_owner_wallet`;
  const nameSalt = `${RUN_ID}_secret_salt`;
  const attendanceNonce = `${RUN_ID}_nonce`;
  const attendanceWallet = `${RUN_ID}_attendance_wallet`;
  const inviteToken = `${RUN_ID}_invite_token`;
  const notificationRef = `${RUN_ID}_ref`;
  let eventId: number | null = null;
  let eventInsertAttemptId: number | null = null;
  let attendanceEventId: string | null = null;
  let draftId: string | null = null;
  let inviteId: string | null = null;
  let notificationId: string | null = null;

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
    // The withheld columns are seeded non-null on purpose: a null column and a
    // denied column both read as "nothing came back".
    const { error } = await admin.from("certificates").insert({
      address: certAddress,
      edition_address: editionAddress,
      student_name: "RLS Probe Student",
      status: "Requested",
      owner_did: did,
      owner_wallet: ownerWallet,
      name_salt: nameSalt,
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
  {
    const { data, error } = await admin
      .from("attendance_events")
      .insert({
        name: "RLS probe attendance event",
        image_url: "https://example.invalid/probe.png",
        metadata_uri: "https://example.invalid/probe.json",
        collection_address: `${RUN_ID}_collection`,
        event_date: new Date().toISOString().slice(0, 10),
        max_supply: 10,
        claim_token: `${RUN_ID}_claim_token`,
        created_by_wallet: `${RUN_ID}_creator_wallet`,
      })
      .select("id")
      .single();
    if (error || !data)
      throw new Error(
        `setup: attendance_events insert failed: ${error?.message}`,
      );
    attendanceEventId = (data as { id: string }).id;
  }
  {
    const { error } = await admin.from("attendance_claims").insert({
      event_id: attendanceEventId,
      wallet: attendanceWallet,
      status: "pending",
      reserved_at: new Date().toISOString(),
    });
    if (error)
      throw new Error(
        `setup: attendance_claims insert failed: ${error.message}`,
      );
  }
  {
    const { error } = await admin.from("attendance_nonces").insert({
      nonce: attendanceNonce,
      wallet: attendanceWallet,
      purpose: "rls-probe",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    if (error)
      throw new Error(
        `setup: attendance_nonces insert failed: ${error.message}`,
      );
  }
  // 0005_overhaul.sql's three tables. Same posture as profiles/attendance_*:
  // RLS enabled, zero policies, service-role only. What they hold is why —
  // drafts are unpublished edition metadata, `signer_invites.token` is a
  // bearer capability that binds a seat (plus the signer's email), and
  // `notification_log.recipient` is an email address. Each is seeded with a
  // real, non-null value so a denied read can't be mistaken for an empty one.
  {
    const { data, error } = await admin
      .from("edition_drafts")
      .insert({
        meta: { name: "RLS probe draft", slug: `${RUN_ID}-draft` },
        created_by: did,
      })
      .select("id")
      .single();
    if (error || !data)
      throw new Error(`setup: edition_drafts insert failed: ${error?.message}`);
    draftId = (data as { id: string }).id;
  }
  {
    const { data, error } = await admin
      .from("signer_invites")
      .insert({
        draft_id: draftId,
        name: "Probe Invitee",
        role: "Instrutor(a)",
        email: "rls-probe-invite@example.invalid",
        token: inviteToken,
      })
      .select("id")
      .single();
    if (error || !data)
      throw new Error(`setup: signer_invites insert failed: ${error?.message}`);
    inviteId = (data as { id: string }).id;
  }
  {
    const { data, error } = await admin
      .from("notification_log")
      .insert({
        type: "rls_probe_seed",
        recipient: "rls-probe-notify@example.invalid",
        ref_id: notificationRef,
      })
      .select("id")
      .single();
    if (error || !data)
      throw new Error(
        `setup: notification_log insert failed: ${error?.message}`,
      );
    notificationId = (data as { id: string }).id;
  }
  console.log("Seed complete.\n");

  try {
    // -------------------------------------------------------------------
    // SELECT — public tables must be readable by anon.
    // -------------------------------------------------------------------
    for (const [table, match] of [
      ["editions", { address: editionAddress }],
      ["edition_signers", { edition_address: editionAddress }],
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

    // certificates is readable, but only through the public column allowlist
    // 0003_hardening.sql grants — so the "allowed" probe must ask for exactly
    // that projection, not `*`.
    {
      const { data, error } = await anon
        .from("certificates")
        .select(CERT_PUBLIC_COLUMNS)
        .eq("address", certAddress);
      if (error) {
        record(
          "certificates",
          "select-allowed",
          "FAIL",
          `anon SELECT of the public column list errored: ${error.message} — the verify page is broken`,
        );
      } else if (!data || data.length === 0) {
        record(
          "certificates",
          "select-allowed",
          "FAIL",
          "anon SELECT returned 0 rows for a row known to exist",
        );
      } else {
        record(
          "certificates",
          "select-allowed",
          "PASS",
          `public columns visible (${data.length} row(s))`,
        );
      }
    }

    // -------------------------------------------------------------------
    // SELECT columns — the anon key must NOT be able to read (or filter on)
    // name_salt / owner_did / owner_wallet. name_salt is the secret half of
    // the on-chain sha256(salt || name) commitment; the owner columns are the
    // student's identity. Together they'd allow bulk name<->wallet<->DID
    // enumeration. See 0003_hardening.sql §1.
    // -------------------------------------------------------------------
    await expectReadDenied(
      "certificates",
      "select-columns",
      'select("*")',
      anon.from("certificates").select("*").eq("address", certAddress),
    );

    for (const column of CERT_WITHHELD_COLUMNS) {
      await expectReadDenied(
        "certificates",
        "select-columns",
        `select("${column}")`,
        anon.from("certificates").select(column).eq("address", certAddress),
      );
    }

    // A column GRANT also governs WHERE clauses, which is what stops anon from
    // confirming a DID it cannot read by probing for a match.
    await expectReadDenied(
      "certificates",
      "select-columns",
      "filter on owner_did",
      anon.from("certificates").select("address").eq("owner_did", did),
    );

    // -------------------------------------------------------------------
    // SELECT — profiles/events/attendance_* must be INVISIBLE to anon
    // (RLS enabled, no policy at all).
    // -------------------------------------------------------------------
    for (const [table, match] of [
      ["profiles", { did }],
      ["events", { id: eventId as number }],
      ["attendance_events", { id: attendanceEventId as string }],
      ["attendance_claims", { wallet: attendanceWallet }],
      ["attendance_nonces", { nonce: attendanceNonce }],
      ["edition_drafts", { id: draftId as string }],
      ["signer_invites", { id: inviteId as string }],
      ["notification_log", { id: notificationId as string }],
    ] as const) {
      const { data, error } = await anon.from(table).select("*").match(match);
      if (error) {
        record(
          table,
          "select-denied",
          "PASS",
          `anon SELECT errored (denied): ${error.message}`,
        );
      } else if (data && data.length > 0) {
        record(
          table,
          "select-denied",
          "FAIL",
          "anon SELECT returned the row — NOT DENIED",
        );
      } else {
        record(table, "select-denied", "PASS", "0 rows returned (RLS-hidden)");
      }
    }

    // -------------------------------------------------------------------
    // INSERT — anon must be unable to create a row in any table.
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
    {
      const r = await attempt(
        anon
          .from("attendance_claims")
          .insert({
            event_id: attendanceEventId,
            wallet: `${RUN_ID}_attendance_wallet_insert`,
          })
          .select(),
      );
      record(
        "attendance_claims",
        "insert",
        r.blocked ? "PASS" : "FAIL",
        r.detail,
      );
    }
    {
      const r = await attempt(
        anon
          .from("attendance_nonces")
          .insert({
            nonce: `${RUN_ID}_nonce_insert`,
            wallet: attendanceWallet,
            purpose: "rls-probe-insert",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          })
          .select(),
      );
      record(
        "attendance_nonces",
        "insert",
        r.blocked ? "PASS" : "FAIL",
        r.detail,
      );
    }
    {
      const r = await attempt(
        anon
          .from("edition_drafts")
          .insert({
            meta: { name: "RLS probe draft insert attempt" },
            created_by: didInsertAttempt,
          })
          .select(),
      );
      record("edition_drafts", "insert", r.blocked ? "PASS" : "FAIL", r.detail);
    }
    {
      // An anon INSERT here would be a seat-minting primitive: whoever writes
      // the row chooses the token, and the token is the magic link that binds a
      // signer wallet to a draft.
      const r = await attempt(
        anon
          .from("signer_invites")
          .insert({
            draft_id: draftId,
            name: "Probe Invitee Insert Attempt",
            role: "Instrutor(a)",
            email: "rls-probe-invite-insert@example.invalid",
            token: `${RUN_ID}_invite_token_insert`,
          })
          .select(),
      );
      record("signer_invites", "insert", r.blocked ? "PASS" : "FAIL", r.detail);
    }
    {
      // notification_log is the rate limiter behind `notifyOnce`; a forged row
      // suppresses a real email, an unrestricted one lets anyone read who was
      // mailed about what.
      const r = await attempt(
        anon
          .from("notification_log")
          .insert({
            type: "rls_probe_insert_attempt",
            recipient: "rls-probe-notify-insert@example.invalid",
            ref_id: `${RUN_ID}_ref_insert`,
          })
          .select(),
      );
      record(
        "notification_log",
        "insert",
        r.blocked ? "PASS" : "FAIL",
        r.detail,
      );
    }

    // -------------------------------------------------------------------
    // RPC — the attendance SECURITY functions are service-role-only
    // (0003_hardening.sql §4). attendance_release_claim in particular is a
    // free capacity-decrement primitive for anyone who can guess a claim uuid,
    // and reserve_claim mints capacity pressure at will.
    // -------------------------------------------------------------------
    {
      const r = await attemptRpc(
        anon.rpc("attendance_reserve_claim", {
          p_event_id: attendanceEventId,
          p_wallet: `${RUN_ID}_rpc_wallet`,
        }),
      );
      record(
        "attendance_reserve_claim",
        "rpc-denied",
        r.blocked ? "PASS" : "FAIL",
        r.detail,
      );
    }
    {
      const r = await attemptRpc(
        anon.rpc("attendance_release_claim", { p_claim_id: randomUUID() }),
      );
      record(
        "attendance_release_claim",
        "rpc-denied",
        r.blocked ? "PASS" : "FAIL",
        r.detail,
      );
    }
    {
      const r = await attemptRpc(
        anon.rpc("attendance_mark_minted", {
          p_claim_id: randomUUID(),
          p_tx_sig: `${RUN_ID}_sig`,
        }),
      );
      record(
        "attendance_mark_minted",
        "rpc-denied",
        r.blocked ? "PASS" : "FAIL",
        r.detail,
      );
    }

    // -------------------------------------------------------------------
    // STORAGE — the four buckets are public to READ by design (rendered
    // certificate PNGs, metadata JSON and attendance art are served straight
    // from their public URLs). Writing is the part that must be
    // service-role-only: an anon upload would let anyone overwrite the
    // artifact a verify page renders.
    // -------------------------------------------------------------------
    for (const bucket of STORAGE_BUCKETS) {
      const path = `${RUN_ID}/probe.txt`;
      const { error } = await anon.storage
        .from(bucket)
        .upload(path, new Blob(["rls probe"]), { contentType: "text/plain" });
      if (error) {
        record(
          bucket,
          "storage-write",
          "PASS",
          `anon upload denied: ${error.message}`,
        );
      } else {
        record(
          bucket,
          "storage-write",
          "FAIL",
          "anon upload SUCCEEDED — NOT BLOCKED",
        );
        await admin.storage.from(bucket).remove([path]);
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
      [
        "attendance_events",
        { id: attendanceEventId as string },
        { max_supply: 99999 },
      ],
      [
        "attendance_claims",
        { wallet: attendanceWallet },
        { status: "minted" as const },
      ],
      [
        "attendance_nonces",
        { nonce: attendanceNonce },
        { used_at: new Date().toISOString() },
      ],
      [
        "edition_drafts",
        { id: draftId as string },
        { chain_address: `${RUN_ID}_tampered_edition` },
      ],
      // The one that matters most: rebinding `wallet` on an accepted seat is
      // how an attacker would get their own key baked into `create_edition`.
      [
        "signer_invites",
        { id: inviteId as string },
        { wallet: `${RUN_ID}_tampered_wallet`, status: "accepted" as const },
      ],
      [
        "notification_log",
        { id: notificationId as string },
        { recipient: "tampered@example.invalid" },
      ],
    ] as const) {
      const r = await attempt(
        anon.from(table).update(patch).match(match).select(),
      );
      record(table, "update", r.blocked ? "PASS" : "FAIL", r.detail);
    }

    // -------------------------------------------------------------------
    // DELETE — anon must be unable to remove the seeded row in any table.
    // Run last (destructive); order among these doesn't matter further.
    // -------------------------------------------------------------------
    for (const [table, match] of [
      ["edition_signers", { edition_address: editionAddress, position: 0 }],
      ["certificates", { address: certAddress }],
      ["editions", { address: editionAddress }],
      ["profiles", { did }],
      ["events", { id: eventId as number }],
      ["attendance_claims", { wallet: attendanceWallet }],
      ["attendance_nonces", { nonce: attendanceNonce }],
      ["attendance_events", { id: attendanceEventId as string }],
      ["signer_invites", { id: inviteId as string }],
      ["edition_drafts", { id: draftId as string }],
      ["notification_log", { id: notificationId as string }],
    ] as const) {
      const r = await attempt(anon.from(table).delete().match(match).select());
      record(table, "delete", r.blocked ? "PASS" : "FAIL", r.detail);
    }

    // -------------------------------------------------------------------
    // The `authenticated` role — the other half of 0005's posture, and the
    // half PostgREST alone cannot reach from here: the anon key is a JWT the
    // project signed with `role: anon`, and there is no way to mint an
    // `authenticated` one without either the JWT secret or creating a real
    // auth user in a production project. So this half runs over the Postgres
    // connection instead, as the role itself, inside a transaction that is
    // always rolled back.
    //
    // It matters because "RLS is on" and "the role has no privileges" are
    // different guarantees with different failure modes: a future migration
    // adding `grant select on edition_drafts to authenticated` (or one policy
    // scoped `to public`) would open every draft, seat token and notification
    // recipient to anyone holding a logged-in session, while every anon probe
    // above stayed green.
    // -------------------------------------------------------------------
    await probeAuthenticatedRole(env.dbUrl, {
      draftId: draftId as string,
      inviteId: inviteId as string,
      notificationId: notificationId as string,
    });
  } finally {
    console.log("\nCleaning up probe rows (service role)...");
    // Deleting the edition cascades to edition_signers + certificates, and
    // the attendance event cascades to attendance_claims (0001_init.sql /
    // 0002_attendance.sql: `on delete cascade`). Each delete tolerates the row
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
    await admin.from("attendance_nonces").delete().like("nonce", `${RUN_ID}%`);
    if (attendanceEventId !== null) {
      await admin
        .from("attendance_events")
        .delete()
        .eq("id", attendanceEventId);
    }
    // edition_drafts cascades to signer_invites (0005_overhaul.sql). Both
    // deletes are run by run-scoped marker rather than by id so a row that
    // leaked through an unexpected INSERT above is swept up too.
    await admin.from("signer_invites").delete().like("token", `${RUN_ID}%`);
    await admin
      .from("edition_drafts")
      .delete()
      .like("created_by", `${RUN_ID}%`);
    await admin.from("notification_log").delete().like("ref_id", `${RUN_ID}%`);
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
      `\n${failures.length} RLS check(s) FAILED — the anon key can do something it should not be able to do. Fix supabase/migrations/*.sql before shipping.`,
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
