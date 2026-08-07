import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { dbConfigured, upsertProfile } from "@/lib/db/mutations";

/**
 * Best-effort session -> profile mirror sync, called once by the client
 * right after Privy reports `authenticated: true` (see
 * components/auth-sync.tsx). Never the source of truth for role/session
 * data — that's always re-derived from the identity token in `lib/auth.ts`.
 */
export async function POST(): Promise<NextResponse> {
  return apiRoute(async () => {
    const session = await requireUser();
    if (dbConfigured) {
      await upsertProfile({
        did: session.did,
        email: session.email,
        wallets: session.wallets,
      });
    }
    return { ok: true as const };
  });
}
