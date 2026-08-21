import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";

// The nav reads this route to decide which items exist, so the cases that
// matter are the four session × creator combinations. Only the two identity
// lookups are faked; the apiRoute envelope stays real (route-test style of
// app/api/cron/digest/__tests__/route.test.ts).
const state = {
  session: null as SessionUser | null,
  creatorWallet: null as string | null,
};

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(async () => state.session),
}));
vi.mock("@/lib/attendance/require-creator", () => ({
  getCreatorWallet: vi.fn(async () => state.creatorWallet),
}));

const { GET } = await import("../route");

const CREATOR_WALLET = "CreAtor1111111111111111111111111111111111";

const SESSION: SessionUser = {
  did: "did:privy:abc",
  email: "signer@example.com",
  wallets: [CREATOR_WALLET],
  role: "student",
  isCertifier: true,
};

async function get(): Promise<Record<string, unknown>> {
  const response = (await GET()) as unknown as {
    body: Record<string, unknown>;
    status: number;
  };
  expect(response.status).toBe(200);
  return response.body;
}

describe("GET /api/me", () => {
  beforeEach(() => {
    state.session = null;
    state.creatorWallet = null;
  });

  it("reports an anonymous visitor without throwing", async () => {
    await expect(get()).resolves.toMatchObject({
      authenticated: false,
      did: null,
      email: null,
      wallets: [],
      role: "student",
      isCertifier: false,
      isEventCreator: false,
    });
  });

  // The reason isEventCreator is resolved outside the session branch: a creator
  // who signed in by wallet proof holds only the attendance_session cookie and
  // has no Privy session, so folding this into the authenticated case would
  // hide /events from exactly the people entitled to it.
  it("reports a cookie-only creator even with no Privy session", async () => {
    state.creatorWallet = CREATOR_WALLET;

    await expect(get()).resolves.toMatchObject({
      authenticated: false,
      isEventCreator: true,
    });
  });

  it("leaves isEventCreator false for a signed-in non-creator", async () => {
    state.session = SESSION;

    await expect(get()).resolves.toMatchObject({
      authenticated: true,
      email: "signer@example.com",
      role: "student",
      isCertifier: true,
      isEventCreator: false,
    });
  });

  it("keeps the session's own role flags when the visitor is also a creator", async () => {
    state.session = { ...SESSION, role: "sysadmin" };
    state.creatorWallet = CREATOR_WALLET;

    await expect(get()).resolves.toMatchObject({
      authenticated: true,
      role: "sysadmin",
      isCertifier: true,
      isEventCreator: true,
    });
  });
});
