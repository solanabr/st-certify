import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import type { AttendanceClaimForOwner } from "@/lib/db/attendance-queries";

// Only the session and the query are faked; the apiRoute envelope stays real
// (route-test style of app/api/me/__tests__/route.test.ts), so the 401 below is
// the envelope's own mapping rather than an assertion about a mock.
const state = { session: null as SessionUser | null };

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => {
    if (!state.session) fail("UNAUTHORIZED", "Entre para continuar.");
    return state.session;
  }),
}));
vi.mock("@/lib/db/attendance-queries", () => ({
  listAttendanceClaimsForWallets: vi.fn(async () => []),
}));

const { listAttendanceClaimsForWallets } =
  await import("@/lib/db/attendance-queries");
const { GET } = await import("../route");

const SESSION: SessionUser = {
  did: "did:privy:abc",
  email: "student@example.com",
  wallets: ["Wa11et1", "Wa11et2"],
  role: "student",
  isCertifier: false,
};

const CLAIM: AttendanceClaimForOwner = {
  eventName: "Superteam Meetup",
  eventDate: "2026-08-20",
  imageUrl: "https://example.test/i.png",
  assetId: "AssetXYZ",
  txSig: "SigABC",
  claimedAt: "2026-08-20T12:00:00Z",
};

async function get(): Promise<{ body: unknown; status: number }> {
  return (await GET()) as unknown as { body: unknown; status: number };
}

describe("GET /api/me/attendance", () => {
  beforeEach(() => {
    state.session = SESSION;
    vi.clearAllMocks();
    vi.mocked(listAttendanceClaimsForWallets).mockResolvedValue([]);
  });

  it("returns the claims for every wallet on the session", async () => {
    vi.mocked(listAttendanceClaimsForWallets).mockResolvedValue([CLAIM]);

    await expect(get()).resolves.toEqual({ body: [CLAIM], status: 200 });
    expect(listAttendanceClaimsForWallets).toHaveBeenCalledWith(
      SESSION.wallets,
    );
  });

  it("answers an empty list rather than an error when nothing was claimed", async () => {
    await expect(get()).resolves.toEqual({ body: [], status: 200 });
  });

  it("rejects an anonymous visitor with 401 and never queries", async () => {
    state.session = null;

    const response = await get();
    expect(response.status).toBe(401);
    expect(listAttendanceClaimsForWallets).not.toHaveBeenCalled();
  });
});
