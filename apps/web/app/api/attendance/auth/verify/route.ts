import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { fail } from "@/lib/errors";
import { authVerifySchema } from "@/lib/attendance/schemas";
import { resolveProvedWallet } from "@/lib/attendance/proof";
import { creatorAllowlist } from "@/lib/attendance/require-creator";
import {
  sealSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
} from "@/lib/attendance/session";
import { consumeNonce } from "@/lib/db/attendance-mutations";
import { getSessionUser } from "@/lib/auth";

/**
 * Verifies a SIWS-signed (or session-linked) wallet proof for the
 * attendance-creator purpose, checks the creator allowlist, then seals the
 * attendance_session cookie. Cookie-setting means this can't use the plain
 * `apiRoute` wrapper (it builds its own response) — manual try/catch ->
 * `apiError` instead.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = authVerifySchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!body.success) {
      fail("VALIDATION", "Dados inválidos.", { detail: body.error.message });
    }

    const wallet = await resolveProvedWallet(body.data, "attendance-creator", {
      consumeNonce,
      getSessionWallets: async () => (await getSessionUser())?.wallets ?? [],
      expectedDomain: new URL(request.url).host,
    });

    if (!creatorAllowlist().has(wallet)) {
      fail(
        "ATTENDANCE_NOT_CREATOR",
        "Esta carteira não está autorizada a criar eventos.",
      );
    }

    const secret = process.env.ATTENDANCE_SESSION_SECRET;
    if (!secret) {
      fail("INTERNAL", "ATTENDANCE_SESSION_SECRET não configurado.");
    }
    const sealed = sealSession(wallet, Date.now() + SESSION_MAX_AGE_MS, secret);

    const response = NextResponse.json({ wallet });
    response.cookies.set(SESSION_COOKIE, sealed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    return response;
  } catch (err) {
    return apiError(err);
  }
}
