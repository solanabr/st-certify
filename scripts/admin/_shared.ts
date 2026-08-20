/**
 * Shared helpers for scripts/admin/*.ts. Not a standalone script (leading
 * underscore). Deliberately self-contained like the rest of scripts/ (see
 * scripts/e2e-attendance-devnet.ts, scripts/create-attendance-tree.ts) —
 * this isolated install can't resolve apps/web's `@/` path alias, so small
 * helpers (loadKeypairBytes, resolveRpcUrl) are re-implemented here rather
 * than imported. Kept in one place so the 7 admin scripts don't each
 * re-duplicate it a further time.
 *
 * Exit code convention used by every script in this directory:
 *   0 = OK — check passed / nothing to do / action completed cleanly
 *   1 = FINDINGS — the condition the script looks for was detected
 *       (stale reservations, anomalies, capacity warning, low balance...)
 *   2 = ERROR — the script couldn't complete the check at all (bad args,
 *       unreachable Supabase/RPC, event not found, partial write failure)
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import type { Umi } from "@metaplex-foundation/umi";
import { mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { mplAccountCompression } from "@metaplex-foundation/mpl-account-compression";

export const ROOT = join(import.meta.dirname, "..", "..");

export const EXIT = { OK: 0, FINDINGS: 1, ERROR: 2 } as const;

// ---------------------------------------------------------------------------
// Attendance constants — mirror apps/web/lib/attendance/constants.ts. Can't
// import it (no path alias outside the Next.js build); keep in sync by hand.
// ---------------------------------------------------------------------------
export const ATTENDANCE_TREE_CAPACITY = 16_384;
export const ATTENDANCE_CAPACITY_WARN = 0.8;
export const ATTENDANCE_CAPACITY_CRITICAL = 0.95;
/** Measured devnet cost per mintV2 (see README.md "Attendance NFTs", 2026-08-19). */
export const MINT_COST_LAMPORTS = 95_000;
/** SQL's own in-flight window (0002_attendance.sql, attendance_reserve_claim). */
export const RESERVATION_IN_FLIGHT_SECONDS = 90;

export function loadRootEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // No .env found — assume the environment is already configured.
  }
}

/**
 * OPERATOR/NOTARY/DEPLOYER_SECRET_KEY are a JSON byte array inline or a path
 * (repo-root-relative) to one — same convention as
 * apps/web/lib/chain/server-tx.ts#loadKeypairBytes and the other scripts/
 * files. Never log `raw`/`parsed`/the returned bytes.
 */
export function loadKeypairBytes(envVal: string): Uint8Array {
  const trimmed = envVal.trim();
  const raw = trimmed.startsWith("[")
    ? trimmed
    : readFileSync(isAbsolute(trimmed) ? trimmed : join(ROOT, trimmed), "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid key: malformed JSON.");
  }
  if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === "number")) {
    throw new Error(
      "Invalid secret key: unexpected format (expected a JSON byte array).",
    );
  }
  return new Uint8Array(parsed);
}

/** first6…last4 — for claim_token and any other bearer-capability string. Never print the raw value. */
export function maskToken(token: string | null | undefined): string {
  if (!token) return "(none)";
  if (token.length <= 10) return "*".repeat(token.length);
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Tiny argv helpers — no CLI-parsing dependency available (isolated install,
// no new deps allowed).
// ---------------------------------------------------------------------------

export function hasFlag(argv: string[], ...names: string[]): boolean {
  return argv.some((a) => names.includes(a));
}

/** Returns the value after `--name` / `--name=value`, or undefined. */
export function getFlagValue(argv: string[], name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

export function getFlagNumber(
  argv: string[],
  name: string,
  fallback: number,
): number {
  const raw = getFlagValue(argv, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Non-flag positional arguments (skips `--x`, `--x value`, and `-h`). */
export function positionals(argv: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("-")) {
      const name = a.replace(/^--/, "").split("=")[0];
      if (valueFlags.includes(name) && !a.includes("=")) i++; // skip its value token
      continue;
    }
    out.push(a);
  }
  return out;
}

export function printHelpAndExit(text: string): never {
  console.log(text.trim() + "\n");
  process.exit(EXIT.OK);
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

export function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

// ---------------------------------------------------------------------------
// RPC — mirrors apps/web/lib/chain/rpc.ts#resolveRpcUrl (Helius when
// available, else the public URL). No `window` check needed: scripts are
// always server-side.
// ---------------------------------------------------------------------------

export function resolveRpcUrl(): string {
  const heliusKey = process.env.HELIUS_API_KEY;
  const publicUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "";
  if (!heliusKey) return publicUrl;
  const cluster =
    publicUrl === "" || publicUrl.includes("devnet") ? "devnet" : "mainnet";
  return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
}

/** Read-only Umi (no identity) — enough for fetchMerkleTree / getBalance / getAccount. */
export function buildReadUmi(rpcUrl: string): Umi {
  return createUmi(rpcUrl).use(mplBubblegum()).use(mplAccountCompression());
}

// ---------------------------------------------------------------------------
// Supabase — service-role client + network-failure classification. Every
// call site should go through `safeSupabase` so an ENOTFOUND (paused
// project) degrades to a clear message instead of an uncaught rejection.
// ---------------------------------------------------------------------------

export interface SupabaseAdminHandle {
  admin: SupabaseClient | null;
  url: string;
  missingEnv: string[];
}

export function buildSupabaseAdmin(): SupabaseAdminHandle {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const missingEnv: string[] = [];
  if (!url) missingEnv.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) missingEnv.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missingEnv.length > 0) return { admin: null, url, missingEnv };
  return {
    admin: createClient(url, serviceKey, { auth: { persistSession: false } }),
    url,
    missingEnv,
  };
}

const NETWORK_ERROR_PATTERN =
  /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|fetch failed|network/i;

/** If `err` looks like a DNS/network failure (e.g. a paused Supabase project), returns a clear message; else null. */
export function describeIfUnreachable(err: unknown): string | null {
  const message =
    err instanceof Error
      ? `${err.message} ${err.cause instanceof Error ? err.cause.message : String(err.cause ?? "")}`
      : String(err);
  const code =
    (err as { code?: string; cause?: { code?: string } } | undefined) ?? {};
  const codeStr = code.code ?? code.cause?.code ?? "";
  if (
    NETWORK_ERROR_PATTERN.test(message) ||
    NETWORK_ERROR_PATTERN.test(codeStr)
  ) {
    return `Supabase unreachable (${codeStr || "network error"}) — the project may be paused. See docs/runbooks/attendance-incident-playbook.md "Supabase paused / outage".`;
  }
  return null;
}

export type SbResult<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

/**
 * Wraps a Supabase call so a thrown network exception (paused project ->
 * DNS ENOTFOUND) is caught and normalized into the same {data, error} shape
 * PostgREST itself would return for an application-level error — every
 * caller handles both uniformly instead of needing its own try/catch.
 */
export async function safeSupabase<T>(
  fn: () => PromiseLike<SbResult<T>>,
): Promise<SbResult<T>> {
  try {
    return await fn();
  } catch (err) {
    const unreachable = describeIfUnreachable(err);
    return {
      data: null,
      error: {
        message:
          unreachable ?? (err instanceof Error ? err.message : String(err)),
      },
    };
  }
}

export type SbCountResult = {
  count: number | null;
  error: { message: string; code?: string } | null;
};

/** Same as safeSupabase, for `.select(..., { count: 'exact', head: true })` calls (no `data`, just `count`). */
export async function safeSupabaseCount(
  fn: () => PromiseLike<SbCountResult>,
): Promise<SbCountResult> {
  try {
    return await fn();
  } catch (err) {
    const unreachable = describeIfUnreachable(err);
    return {
      count: null,
      error: {
        message:
          unreachable ?? (err instanceof Error ? err.message : String(err)),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Console table — same padEnd approach as scripts/rls-probe.ts.
// ---------------------------------------------------------------------------

export function printTable(rows: string[][]): void {
  if (rows.length === 0) return;
  const widths = rows[0].map((_, col) =>
    Math.max(...rows.map((r) => (r[col] ?? "").length)),
  );
  for (const row of rows) {
    console.log(
      row
        .map((cell, i) => (cell ?? "").padEnd(widths[i]))
        .join("  ")
        .trimEnd(),
    );
  }
}
