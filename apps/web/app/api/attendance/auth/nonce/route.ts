import type { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { fail } from "@/lib/errors";
import { authNonceSchema } from "@/lib/attendance/schemas";
import { buildSiwsMessage } from "@/lib/attendance/siws";
import { createNonce } from "@/lib/db/attendance-mutations";
import { createRateLimiter } from "@/lib/rate-limit";

// Unauthenticated endpoint that writes a DB row per call — cap it per wallet.
// 5/min rather than airdrop's 1/min: a nonce is a cheap row, and a claimant who
// cancels the wallet prompt must be able to retry immediately.
const takeNonceSlot = createRateLimiter({ windowMs: 60_000, max: 5 });

export interface NonceResponse {
  message: string;
  nonce: string;
}

/** Issues a SIWS-style nonce plus the exact message text the wallet must sign. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return apiRoute(async (): Promise<NonceResponse> => {
    const body = authNonceSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!body.success) {
      fail("VALIDATION", "Dados inválidos.", { detail: body.error.message });
    }
    const { wallet, purpose } = body.data;

    const limit = takeNonceSlot(wallet);
    if (!limit.allowed) {
      fail(
        "RATE_LIMITED",
        `Muitas solicitações. Aguarde ${limit.retryAfterSeconds}s e tente novamente.`,
        { retryable: true, action: "retry" },
      );
    }

    const { nonce, issuedAt } = await createNonce(wallet, purpose);
    const message = buildSiwsMessage({
      domain: new URL(request.url).host,
      wallet,
      purpose,
      nonce,
      issuedAt,
    });

    return { message, nonce };
  });
}
