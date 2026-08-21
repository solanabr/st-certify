import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { getSessionUser, type Role } from "@/lib/auth";
import { getCreatorWallet } from "@/lib/attendance/require-creator";

export interface MeResponse {
  authenticated: boolean;
  did: string | null;
  email: string | null;
  wallets: string[];
  role: Role;
  isCertifier: boolean;
  isEventCreator: boolean;
}

/**
 * Never throws for an anonymous visitor — that's an expected state for the
 * nav, not an error.
 *
 * `isEventCreator` runs the same `getCreatorWallet()` check `/events` itself
 * enforces, so the nav item and the page it opens can never disagree. It is
 * resolved outside the session branch on purpose: a creator who signed in by
 * wallet proof holds only the `attendance_session` cookie and has no Privy
 * session at all. Both reads share one request-scoped `getSessionUser()`.
 */
export async function GET(): Promise<NextResponse> {
  return apiRoute(async (): Promise<MeResponse> => {
    const [session, creatorWallet] = await Promise.all([
      getSessionUser(),
      getCreatorWallet(),
    ]);
    const isEventCreator = creatorWallet !== null;

    if (!session) {
      return {
        authenticated: false,
        did: null,
        email: null,
        wallets: [],
        role: "student",
        isCertifier: false,
        isEventCreator,
      };
    }
    return { authenticated: true, ...session, isEventCreator };
  });
}
