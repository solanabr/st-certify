import "server-only";

import { cookies } from "next/headers";
import { fail } from "@/lib/errors";
import { getSessionUser, parseAllowlist } from "@/lib/auth";
import { openSession, SESSION_COOKIE } from "./session";

export function creatorAllowlist(): Set<string> {
  return parseAllowlist(process.env.ATTENDANCE_CREATOR_WALLETS);
}

/** Creator identity: attendance session cookie, or a Privy session whose wallet is allowlisted. */
export async function getCreatorWallet(): Promise<string | null> {
  const allow = creatorAllowlist();
  const secret = process.env.ATTENDANCE_SESSION_SECRET;
  if (secret) {
    const jar = await cookies();
    const sealed = jar.get(SESSION_COOKIE)?.value;
    if (sealed) {
      const session = openSession(sealed, secret);
      if (session && allow.has(session.wallet)) return session.wallet;
    }
  }
  const privy = await getSessionUser();
  const match = privy?.wallets.find((w) => allow.has(w));
  return match ?? null;
}

export async function requireAttendanceCreator(): Promise<string> {
  const wallet = await getCreatorWallet();
  if (!wallet) {
    fail(
      "ATTENDANCE_NOT_CREATOR",
      "Apenas carteiras autorizadas podem gerenciar eventos.",
    );
  }
  return wallet;
}
