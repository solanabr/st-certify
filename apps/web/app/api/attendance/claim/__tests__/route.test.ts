import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { AttendanceEventRow } from "@/lib/db/types";

// Mocked BEFORE importing the route, per vitest's hoisting contract (mirrors
// lib/chain/__tests__/server.test.ts). Everything the handler talks to is
// faked; the gate, the zod schemas and the AppError envelope stay real, since
// the behaviour under test is which bookkeeping call runs after which outcome.
vi.mock("next/server", () => ({
  after: vi.fn(),
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => null) }));
vi.mock("@/lib/attendance/proof", () => ({ resolveProvedWallet: vi.fn() }));
vi.mock("@/lib/db/attendance-queries", () => ({ getEventByToken: vi.fn() }));
vi.mock("@/lib/db/attendance-mutations", () => ({
  consumeNonce: vi.fn(),
  markClaimMintedWithRetry: vi.fn(),
  // Async impl, not a bare vi.fn(): the route chains .catch() onto this call,
  // so a mock returning undefined would fail for the wrong reason.
  releaseClaim: vi.fn(async () => {}),
  reserveClaim: vi.fn(),
  updateClaimAsset: vi.fn(),
}));
vi.mock("@/lib/chain/attendance", () => ({
  mintAttendanceAsset: vi.fn(),
  resolveAttendanceAssetId: vi.fn(async () => null),
}));

const { resolveProvedWallet } = await import("@/lib/attendance/proof");
const { getEventByToken } = await import("@/lib/db/attendance-queries");
const { markClaimMintedWithRetry, releaseClaim, reserveClaim } =
  await import("@/lib/db/attendance-mutations");
const { mintAttendanceAsset } = await import("@/lib/chain/attendance");
const { POST } = await import("../route");

const WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdM9k6bpr";
const CLAIM_ID = "claim-1";
const TX_SIG = "5xTxSignature";

const EVENT: AttendanceEventRow = {
  id: "event-1",
  name: "Superteam Meetup",
  description: "",
  image_url: "https://example.test/i.png",
  metadata_uri: "https://example.test/m.json",
  collection_address: "CoLLection111111111111111111111111111111111",
  event_date: "2026-08-20",
  max_supply: null,
  claim_deadline: null,
  claim_open: true,
  claim_token: "claim-token-abc123",
  created_by_wallet: WALLET,
  minted_count: 0,
  created_at: "2026-08-01T00:00:00Z",
};

interface FakeResponse {
  body: { status?: string; txSig?: string; error?: { code: string } };
  status: number;
}

function post(): Promise<FakeResponse> {
  const request = {
    json: async () => ({ token: EVENT.claim_token, wallet: WALLET }),
    url: "https://certify.test/api/attendance/claim",
  } as unknown as NextRequest;
  return POST(request) as unknown as Promise<FakeResponse>;
}

describe("POST /api/attendance/claim — post-mint failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEventByToken).mockResolvedValue(EVENT);
    vi.mocked(resolveProvedWallet).mockResolvedValue(WALLET);
    vi.mocked(reserveClaim).mockResolvedValue({
      outcome: "reserved",
      claimId: CLAIM_ID,
      existingTxSig: null,
    });
    vi.mocked(markClaimMintedWithRetry).mockResolvedValue(true);
  });

  it("releases the reserved slot when the mint itself fails, without recording anything", async () => {
    vi.mocked(mintAttendanceAsset).mockRejectedValue(
      new Error("blockhash not found"),
    );

    const res = await post();

    expect(releaseClaim).toHaveBeenCalledExactlyOnceWith(CLAIM_ID);
    expect(markClaimMintedWithRetry).not.toHaveBeenCalled();
    expect(res.status).toBe(422);
    expect(res.body.error?.code).toBe("CHAIN_PROGRAM_ERROR");
  });

  it("records the mint and never releases on the happy path", async () => {
    vi.mocked(mintAttendanceAsset).mockResolvedValue({ txSig: TX_SIG });

    const res = await post();

    expect(markClaimMintedWithRetry).toHaveBeenCalledExactlyOnceWith({
      claimId: CLAIM_ID,
      txSig: TX_SIG,
      wallet: WALLET,
    });
    expect(releaseClaim).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ status: "minted", txSig: TX_SIG });
  });

  it("keeps the slot and still reports the mint when the bookkeeping write is exhausted — the asset exists, so a re-claim must not be invited", async () => {
    vi.mocked(mintAttendanceAsset).mockResolvedValue({ txSig: TX_SIG });
    vi.mocked(markClaimMintedWithRetry).mockResolvedValue(false);

    const res = await post();

    expect(releaseClaim).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "minted", txSig: TX_SIG });
  });
});
