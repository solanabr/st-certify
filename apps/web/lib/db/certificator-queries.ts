// Certificator (M4) DB reads. Lives under lib/db/** so the @supabase import
// fence is satisfied; a separate file (not queries.ts) to stay collision-free
// with M3's concurrent edits. Self-contained anon client, mirroring queries.ts.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/errors";
import type { CertificateRow, EditionSignerRow } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False until Supabase env is set — callers degrade to an empty inbox. */
export const dbConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let anonClient: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!dbConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    fail("INTERNAL", "Supabase não configurado.");
  }
  anonClient ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return anonClient;
}

export interface PendingSignerSlot {
  position: number;
  wallet: string;
  name: string;
  role: string | null;
}

export interface PendingCertificate {
  address: string;
  /** The student's legal name — the anti-impersonation surface (plan §Security #2). */
  studentName: string;
  /** cert.student == owner_wallet == the address-targeted refund recipient on reject. */
  ownerWallet: string;
  requestedAt: string;
  signerBitmap: number;
  signedCount: number;
  signerCount: number;
}

export interface PendingEditionGroup {
  editionAddress: string;
  editionName: string;
  signerCount: number;
  /** The caller's bit index within this edition's signer set. */
  callerPosition: number;
  signers: PendingSignerSlot[];
  certificates: PendingCertificate[];
}

/**
 * The caller's registered wallet for signing/rejecting within THIS edition —
 * the single source of truth for wallet resolution. A certifier can be
 * registered under different wallets across editions, so every batch/row
 * action must key off this per-edition lookup rather than reusing one wallet
 * picked from elsewhere in the inbox (fix round 1: mass-sign used to do the
 * latter, which produced on-chain NotASigner for every edition after the
 * first selected one).
 */
export function callerSignerWallet(group: PendingEditionGroup): string {
  return (
    group.signers.find((s) => s.position === group.callerPosition)?.wallet ?? ""
  );
}

function popcount(n: number): number {
  let count = 0;
  for (let bits = n; bits > 0; bits >>= 1) count += bits & 1;
  return count;
}

/**
 * Requested certificates awaiting THIS caller's signature, grouped by edition:
 * editions where one of `wallets` is a registered signer, then Requested certs
 * of those editions whose signer_bitmap bit at the caller's position is unset.
 */
export async function getPendingForSigner(
  wallets: string[],
): Promise<PendingEditionGroup[]> {
  if (!dbConfigured || wallets.length === 0) {
    return [];
  }
  const supabase = db();

  const { data: mine, error: mineErr } = await supabase
    .from("edition_signers")
    .select("edition_address, position, wallet")
    .in("wallet", wallets);
  if (mineErr) {
    fail("INTERNAL", "Falha ao buscar edições do signatário.", {
      detail: mineErr.message,
      retryable: true,
    });
  }
  const callerPosition = new Map<string, number>();
  for (const r of (mine ?? []) as Array<{
    edition_address: string;
    position: number;
  }>) {
    callerPosition.set(r.edition_address, r.position);
  }
  const editionAddresses = [...callerPosition.keys()];
  if (editionAddresses.length === 0) {
    return [];
  }

  const [
    { data: allSigners, error: sigErr },
    { data: edRows, error: edErr },
    { data: certRows, error: certErr },
  ] = await Promise.all([
    supabase
      .from("edition_signers")
      .select("*")
      .in("edition_address", editionAddresses),
    supabase
      .from("editions")
      .select("address, name")
      .in("address", editionAddresses),
    supabase
      .from("certificates")
      .select("*")
      .eq("status", "Requested")
      .in("edition_address", editionAddresses)
      .order("created_at", { ascending: true }),
  ]);
  if (sigErr)
    fail("INTERNAL", "Falha ao buscar signatários.", {
      detail: sigErr.message,
      retryable: true,
    });
  if (edErr)
    fail("INTERNAL", "Falha ao buscar edições.", {
      detail: edErr.message,
      retryable: true,
    });
  if (certErr)
    fail("INTERNAL", "Falha ao buscar certificados pendentes.", {
      detail: certErr.message,
      retryable: true,
    });

  const signersByEdition = new Map<string, EditionSignerRow[]>();
  for (const r of (allSigners ?? []) as EditionSignerRow[]) {
    const list = signersByEdition.get(r.edition_address) ?? [];
    list.push(r);
    signersByEdition.set(r.edition_address, list);
  }
  for (const list of signersByEdition.values())
    list.sort((a, b) => a.position - b.position);

  const editionName = new Map<string, string>(
    ((edRows ?? []) as Array<{ address: string; name: string }>).map((e) => [
      e.address,
      e.name,
    ]),
  );

  return assemblePendingGroups({
    callerPosition,
    signersByEdition,
    editionName,
    certRows: (certRows ?? []) as CertificateRow[],
  });
}

/**
 * Pure grouping + bit-unset filter (exported for unit testing): keep only certs
 * whose caller-position bit is unset — already-signed certs are dropped, which is
 * exactly what makes a batch retry safe (a re-query excludes what confirmed) —
 * group by edition, and drop editions with nothing left pending.
 */
export function assemblePendingGroups(input: {
  callerPosition: Map<string, number>;
  signersByEdition: Map<string, EditionSignerRow[]>;
  editionName: Map<string, string>;
  certRows: CertificateRow[];
}): PendingEditionGroup[] {
  const groups = new Map<string, PendingEditionGroup>();
  for (const c of input.certRows) {
    const position = input.callerPosition.get(c.edition_address);
    if (position === undefined) continue;
    if ((c.signer_bitmap & (1 << position)) !== 0) continue; // caller already signed

    const signers = input.signersByEdition.get(c.edition_address) ?? [];
    let group = groups.get(c.edition_address);
    if (!group) {
      group = {
        editionAddress: c.edition_address,
        editionName: input.editionName.get(c.edition_address) ?? "Edição",
        signerCount: signers.length,
        callerPosition: position,
        signers: signers.map((s) => ({
          position: s.position,
          wallet: s.wallet,
          name: s.name,
          role: s.role,
        })),
        certificates: [],
      };
      groups.set(c.edition_address, group);
    }
    group.certificates.push({
      address: c.address,
      studentName: c.student_name,
      ownerWallet: c.owner_wallet ?? "",
      requestedAt: c.created_at,
      signerBitmap: c.signer_bitmap,
      signedCount: popcount(c.signer_bitmap),
      signerCount: signers.length,
    });
  }
  return [...groups.values()]
    .filter((g) => g.certificates.length > 0)
    .sort((a, b) => a.editionName.localeCompare(b.editionName));
}
