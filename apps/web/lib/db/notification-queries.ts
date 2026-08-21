import "server-only";

// Reads that exist only to address a notification: who signs what, and which
// human to mail about a certificate. Split out of the digest route (W1-B put
// them inline behind getServiceClient) so the cron and the W2-E route triggers
// share one implementation.
//
// Everything here except listAllSignerWallets degrades instead of throwing:
// callers are fire-and-forget notification paths hanging off money-path routes,
// where a missing email must never turn a successful sign or claim into a 500.

import { fail } from "@/lib/errors";
import { dbConfigured, getServiceClient } from "./mutations";

interface SignerWalletRow {
  wallet: string | null;
}

interface InviteEmailRow {
  wallet: string | null;
  email: string | null;
}

/** Every wallet registered as a signer of any edition — the digest's fan-out. */
export async function listAllSignerWallets(): Promise<string[]> {
  if (!dbConfigured) {
    return [];
  }
  const { data, error } = await getServiceClient()
    .from("edition_signers")
    .select("wallet");
  if (error) {
    fail("INTERNAL", "Falha ao listar signatários.", {
      detail: error.message,
      retryable: true,
    });
  }
  return distinctWallets((data ?? []) as SignerWalletRow[]);
}

/** The seats of one edition — who to tell when a request lands. */
export async function listSignerWalletsForEdition(
  editionAddress: string,
): Promise<string[]> {
  if (!dbConfigured) {
    return [];
  }
  const { data, error } = await getServiceClient()
    .from("edition_signers")
    .select("wallet")
    .eq("edition_address", editionAddress);
  if (error) {
    console.warn(
      `[notify-db] signers of ${editionAddress} unavailable:`,
      error.message,
    );
    return [];
  }
  return distinctWallets((data ?? []) as SignerWalletRow[]);
}

/**
 * wallet → email, from the invite each signer accepted. Signers added by raw
 * wallet (pre-overhaul editions) simply don't appear, which callers report as
 * a skip.
 */
export async function signerEmailsByWallet(
  wallets: string[],
): Promise<Map<string, string>> {
  const byWallet = new Map<string, string>();
  if (!dbConfigured || wallets.length === 0) {
    return byWallet;
  }

  const { data, error } = await getServiceClient()
    .from("signer_invites")
    .select("wallet, email")
    .in("wallet", wallets);
  if (error) {
    console.warn("[notify-db] signer emails unavailable:", error.message);
    return byWallet;
  }

  for (const row of (data ?? []) as InviteEmailRow[]) {
    if (row.wallet && row.email && !byWallet.has(row.wallet)) {
      byWallet.set(row.wallet, row.email);
    }
  }
  return byWallet;
}

export interface CertificateNotificationContext {
  certificateAddress: string;
  studentName: string;
  /** Null when no profile links back to this certificate's owner. */
  studentEmail: string | null;
  editionAddress: string;
  editionName: string;
}

interface CertificateContextRow {
  address: string;
  student_name: string;
  edition_address: string;
  owner_did: string | null;
  owner_wallet: string | null;
}

/**
 * Everything a certificate email needs, in one call. The student's address is
 * resolved here at send time from the existing profile linkage — deliberately
 * NOT stored on the certificate row, so the mirror gains no new PII column.
 */
export async function getCertificateNotificationContext(
  address: string,
): Promise<CertificateNotificationContext | null> {
  if (!dbConfigured) {
    return null;
  }
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("certificates")
    .select("address, student_name, edition_address, owner_did, owner_wallet")
    .eq("address", address)
    .maybeSingle();
  if (error) {
    console.warn(
      `[notify-db] certificate ${address} unavailable:`,
      error.message,
    );
    return null;
  }
  const cert = data as CertificateContextRow | null;
  if (!cert) {
    return null;
  }

  // In parallel: this runs off a money-path route's response, and two
  // sequential round trips is two too many for an email lookup.
  const [studentEmail, name] = await Promise.all([
    profileEmail(cert.owner_did, cert.owner_wallet),
    editionName(cert.edition_address),
  ]);

  return {
    certificateAddress: cert.address,
    studentName: cert.student_name,
    studentEmail,
    editionAddress: cert.edition_address,
    editionName: name,
  };
}

/** Falls back to the address so a payload never reads "undefined". */
async function editionName(editionAddress: string): Promise<string> {
  const { data, error } = await getServiceClient()
    .from("editions")
    .select("name")
    .eq("address", editionAddress)
    .maybeSingle();
  if (error) {
    console.warn(
      `[notify-db] edition ${editionAddress} unavailable:`,
      error.message,
    );
    return editionAddress;
  }
  return (data as { name: string } | null)?.name ?? editionAddress;
}

/** did is the exact link; the wallet array is the fallback for older rows. */
async function profileEmail(
  did: string | null,
  wallet: string | null,
): Promise<string | null> {
  const supabase = getServiceClient();

  if (did) {
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("did", did)
      .maybeSingle();
    if (!error) {
      return (data as { email: string | null } | null)?.email ?? null;
    }
    console.warn(`[notify-db] profile ${did} unavailable:`, error.message);
    return null;
  }

  if (!wallet) {
    return null;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .contains("wallets", [wallet])
    .limit(1);
  if (error) {
    console.warn(
      `[notify-db] profile for ${wallet} unavailable:`,
      error.message,
    );
    return null;
  }
  return (data as Array<{ email: string | null }> | null)?.[0]?.email ?? null;
}

function distinctWallets(rows: SignerWalletRow[]): string[] {
  return [
    ...new Set(rows.map((row) => row.wallet).filter((w): w is string => !!w)),
  ];
}
