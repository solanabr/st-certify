/**
 * [ops-3] Pre-event health check — run this before every event. Composes
 * the other read-only checks into one green/red summary:
 *   1. Supabase reachable + attendance_events/claims/nonces tables present
 *   2. Operator balance OK (spawns operator-balance.ts --json)
 *   3. RPC reachable + current slot
 *   4. Tree capacity OK (spawns tree-capacity.ts --json)
 *   5. RLS probe pass (opt-in via --with-rls — spawns ../rls-probe.ts;
 *      skipped by default since it's slower and less urgent than the rest)
 *
 * Checks 2 and 4 spawn the standalone scripts (with --json) instead of
 * re-implementing their threshold math here, so preflight can never drift
 * from what running them individually reports.
 *
 * Usage:
 *   npx tsx scripts/admin/preflight.ts [--with-rls] [--min-mints 50] [--json]
 *
 * Read-only. Exit codes: 0 all checks pass (WARN-level findings still OK),
 * 1 at least one check FAILed, 2 preflight itself couldn't run.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { createSolanaRpc } from "@solana/kit";
import {
  EXIT,
  ROOT,
  buildSupabaseAdmin,
  hasFlag,
  getFlagValue,
  loadRootEnv,
  printHelpAndExit,
  printTable,
  resolveRpcUrl,
  safeSupabaseCount,
} from "./_shared.js";

const HELP = `
preflight — pre-event health check (Supabase, operator balance, RPC, tree capacity, optional RLS probe).

Usage:
  npx tsx scripts/admin/preflight.ts [options]

Options:
  --with-rls           Also run scripts/rls-probe.ts (slower; opt-in)
  --min-mints <n>       Passed through to operator-balance.ts (default: 50)
  --json                Machine-readable output
  -h, --help            Show this help

Exit codes: 0 all checks pass, 1 at least one check FAILed, 2 preflight
itself couldn't run (e.g. missing tsx binary).
`;

type Severity = "OK" | "WARN" | "FAIL";

interface CheckResult {
  name: string;
  severity: Severity;
  detail: string;
}

const TSX_BIN = join(ROOT, "node_modules", ".bin", "tsx");

function runJsonScript(
  scriptPath: string,
  args: string[],
): { ok: boolean; json: unknown; raw: string } {
  const result = spawnSync(TSX_BIN, [scriptPath, ...args, "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30_000,
  });
  const raw = (result.stdout ?? "").trim();
  try {
    return {
      ok: result.status === 0,
      json: raw ? JSON.parse(raw) : null,
      raw: raw || (result.stderr ?? ""),
    };
  } catch {
    return {
      ok: false,
      json: null,
      raw: raw || (result.stderr ?? "(no output)"),
    };
  }
}

async function checkSupabase(): Promise<CheckResult> {
  const { admin, missingEnv } = buildSupabaseAdmin();
  if (!admin)
    return {
      name: "supabase",
      severity: "FAIL",
      detail: `not configured — missing ${missingEnv.join(", ")}`,
    };

  const tables = [
    "attendance_events",
    "attendance_claims",
    "attendance_nonces",
  ] as const;
  const problems: string[] = [];
  for (const table of tables) {
    const { error } = await safeSupabaseCount(() =>
      admin.from(table).select("*", { count: "exact", head: true }),
    );
    if (error) problems.push(`${table}: ${error.message}`);
  }
  if (problems.length > 0)
    return { name: "supabase", severity: "FAIL", detail: problems.join(" | ") };
  return {
    name: "supabase",
    severity: "OK",
    detail: `${tables.length} tables reachable`,
  };
}

async function checkRpc(): Promise<CheckResult> {
  const url = resolveRpcUrl();
  if (!url)
    return {
      name: "rpc",
      severity: "FAIL",
      detail: "NEXT_PUBLIC_RPC_URL not configured",
    };
  try {
    const slot = await createSolanaRpc(url).getSlot().send();
    return { name: "rpc", severity: "OK", detail: `reachable, slot=${slot}` };
  } catch (err) {
    return {
      name: "rpc",
      severity: "FAIL",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkOperatorBalance(minMints: string): CheckResult {
  const r = runJsonScript(
    join(ROOT, "scripts", "admin", "operator-balance.ts"),
    ["--min-mints", minMints],
  );
  if (!r.ok && r.json === null)
    return { name: "operator-balance", severity: "FAIL", detail: r.raw };
  const data = r.json as { ok: boolean; affordableMints?: string } | null;
  return {
    name: "operator-balance",
    severity: data?.ok ? "OK" : "FAIL",
    detail: data?.ok ? `~${data.affordableMints} mints affordable` : r.raw,
  };
}

function checkTreeCapacity(): CheckResult {
  const r = runJsonScript(
    join(ROOT, "scripts", "admin", "tree-capacity.ts"),
    [],
  );
  if (r.json === null)
    return { name: "tree-capacity", severity: "FAIL", detail: r.raw };
  const data = r.json as {
    status: Severity | "CRITICAL";
    used: string;
    capacity: number;
  };
  const severity: Severity =
    data.status === "CRITICAL"
      ? "FAIL"
      : data.status === "WARN"
        ? "WARN"
        : "OK";
  return {
    name: "tree-capacity",
    severity,
    detail: `${data.used}/${data.capacity} leaves used`,
  };
}

function checkRlsProbe(): CheckResult {
  const result = spawnSync(TSX_BIN, [join(ROOT, "scripts", "rls-probe.ts")], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  const tail = (result.stdout ?? "").trim().split("\n").slice(-3).join(" / ");
  return {
    name: "rls-probe",
    severity: result.status === 0 ? "OK" : "FAIL",
    detail: tail || "(no output)",
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "-h", "--help")) printHelpAndExit(HELP);
  loadRootEnv();

  const json = hasFlag(argv, "--json");
  const withRls = hasFlag(argv, "--with-rls");
  const minMints = getFlagValue(argv, "min-mints") ?? "50";

  const checks: CheckResult[] = [];
  checks.push(await checkSupabase());
  checks.push(await checkRpc());
  checks.push(checkOperatorBalance(minMints));
  checks.push(checkTreeCapacity());
  if (withRls) checks.push(checkRlsProbe());

  const anyFail = checks.some((c) => c.severity === "FAIL");
  const anyWarn = checks.some((c) => c.severity === "WARN");
  const overall: Severity = anyFail ? "FAIL" : anyWarn ? "WARN" : "OK";

  if (json) {
    console.log(JSON.stringify({ ok: !anyFail, overall, checks }, null, 2));
  } else {
    console.log("== Preflight ==\n");
    printTable([
      ["check", "status", "detail"],
      ...checks.map((c) => [c.name, c.severity, c.detail]),
    ]);
    console.log(
      `\n${overall === "OK" ? "ALL CLEAR" : overall === "WARN" ? "CLEAR WITH WARNINGS" : "NOT CLEAR"} — ${checks.filter((c) => c.severity === "OK").length}/${checks.length} checks OK.`,
    );
    if (!withRls)
      console.log("(rls-probe skipped — pass --with-rls to include it)");
  }

  process.exit(anyFail ? EXIT.FINDINGS : EXIT.OK);
}

main().catch((err: unknown) => {
  console.error("preflight FAILED:", err instanceof Error ? err.message : err);
  process.exit(EXIT.ERROR);
});
