import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { PrivyClient, type User } from "@privy-io/node";
import { fail } from "@/lib/errors";
import { isEditionSignerWallet } from "@/lib/db/queries";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const APP_SECRET = process.env.PRIVY_APP_SECRET;

let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient | null {
  if (!APP_ID || !APP_SECRET) {
    return null;
  }
  privyClient ??= new PrivyClient({ appId: APP_ID, appSecret: APP_SECRET });
  return privyClient;
}

export type Role = "student" | "sysadmin";

export interface SessionUser {
  did: string;
  email: string | null;
  wallets: string[];
  role: Role;
  isCertifier: boolean;
}

/** Exported for unit testing (lib/__tests__/auth.test.ts) — pure, no I/O. Does not case-fold: callers decide. */
export function parseAllowlist(envVal: string | undefined): Set<string> {
  return new Set(
    (envVal ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * The role-resolution decision itself, isolated from the Privy/cookie I/O
 * around it so it's directly unit-testable: sysadmin iff the identity's
 * email or any wallet is in the env allowlists. Emails compare
 * case-insensitively (conventional); wallets compare exact-case — base58
 * Solana addresses are case-sensitive, so folding case before comparing
 * would both miss real matches and risk conflating distinct addresses.
 */
export function isAdminIdentity(
  email: string | null,
  wallets: readonly string[],
  adminEmailsEnv: string | undefined,
  adminWalletsEnv: string | undefined,
): boolean {
  const adminEmails = new Set(
    Array.from(parseAllowlist(adminEmailsEnv), (e) => e.toLowerCase()),
  );
  const adminWallets = parseAllowlist(adminWalletsEnv);
  return (
    (email !== null && adminEmails.has(email.toLowerCase())) ||
    wallets.some((w) => adminWallets.has(w))
  );
}

function solanaWallets(user: User): string[] {
  const wallets = new Set<string>();
  for (const account of user.linked_accounts) {
    if (
      account.type === "wallet" &&
      "chain_type" in account &&
      account.chain_type === "solana"
    ) {
      wallets.add(account.address);
    }
  }
  return Array.from(wallets);
}

function primaryEmail(user: User): string | null {
  const email = user.linked_accounts.find((a) => a.type === "email");
  return email && "address" in email ? email.address : null;
}

/**
 * Resolves the current request's session from the `privy-id-token` cookie
 * (set automatically by the Privy client SDK once identity tokens are
 * enabled for the app). Returns null for anonymous visitors — this is the
 * expected, non-error state for public pages and the nav's logged-out view.
 * `cache()`-wrapped so multiple call sites in one request (layout + page +
 * nav) share a single token verification.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const client = getPrivyClient();
  if (!client) {
    return null;
  }

  const jar = await cookies();
  const idToken = jar.get("privy-id-token")?.value;
  if (!idToken) {
    return null;
  }

  let user: User;
  try {
    user = await client.users().get({ id_token: idToken });
  } catch {
    return null;
  }

  const email = primaryEmail(user);
  const wallets = solanaWallets(user);
  const isSysadmin = isAdminIdentity(
    email,
    wallets,
    process.env.ADMIN_EMAILS,
    process.env.ADMIN_WALLETS,
  );

  const isCertifier = await isEditionSignerWallet(wallets);

  return {
    did: user.id,
    email,
    wallets,
    role: isSysadmin ? "sysadmin" : "student",
    isCertifier,
  };
});

/** Throws `UNAUTHORIZED` if there is no logged-in session. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSessionUser();
  if (!session) {
    fail("UNAUTHORIZED", "Entre para continuar.", { action: "login" });
  }
  return session;
}

/** Throws unless the caller is a wallet listed as a signer on at least one edition. */
export async function requireCertifier(): Promise<SessionUser> {
  const session = await requireUser();
  if (!session.isCertifier) {
    fail(
      "FORBIDDEN",
      "Apenas signatários designados podem acessar esta página.",
    );
  }
  return session;
}

/** Throws unless the caller's email/wallet is in the sysadmin allowlist. */
export async function requireSysadmin(): Promise<SessionUser> {
  const session = await requireUser();
  if (session.role !== "sysadmin") {
    fail("FORBIDDEN", "Apenas administradores podem acessar esta página.");
  }
  return session;
}
