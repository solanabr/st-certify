import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { walletAddressSchema } from "@/lib/schemas";
import { requestDevnetAirdrop } from "@/lib/chain/server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const FAUCET_FALLBACK_URL = "https://faucet.solana.com";

// In-memory, per-DID — acceptable for tonight's single-process devnet
// deployment; a real KV store is a wake-up-later item if this scales out.
const lastAirdropByDid = new Map<string, number>();

export interface AirdropResponse {
  signature: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<AirdropResponse> => {
    const session = await requireUser();

    const body: unknown = await request.json().catch(() => null);
    const walletParsed = walletAddressSchema.safeParse(
      (body as { wallet?: unknown } | null)?.wallet,
    );
    if (!walletParsed.success || !session.wallets.includes(walletParsed.data)) {
      fail("VALIDATION", "Carteira inválida.");
    }

    const lastRequest = lastAirdropByDid.get(session.did);
    const now = Date.now();
    if (lastRequest !== undefined && now - lastRequest < RATE_LIMIT_WINDOW_MS) {
      const waitSeconds = Math.ceil(
        (RATE_LIMIT_WINDOW_MS - (now - lastRequest)) / 1000,
      );
      fail(
        "RATE_LIMITED",
        `Aguarde ${waitSeconds}s antes de solicitar outro airdrop, ou use ${FAUCET_FALLBACK_URL}.`,
        { retryable: true, action: "retry" },
      );
    }
    lastAirdropByDid.set(session.did, now);

    return requestDevnetAirdrop(walletParsed.data);
  });
}
