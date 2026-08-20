import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getCreatorWallet reads next/headers cookies() and @/lib/auth.getSessionUser;
// everything else (parseAllowlist, openSession/sealSession) runs for real so the
// trust chain — sealed cookie AND still-allowlisted, secret gating, Privy
// fallback — is exercised end to end.
const cookiesMock = vi.fn();
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));

const getSessionUserMock = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSessionUser: () => getSessionUserMock() };
});

import { getCreatorWallet, requireAttendanceCreator } from "../require-creator";
import { sealSession, SESSION_COOKIE } from "../session";

const SECRET = "test-session-secret";
const ALLOWED = "ENn4h8RZGXfXhmU6LQKZtujWjddpvYhT4NXWhNacvHsb";
const OTHER = "B6pK7Txek2fcQDmNVBCQNB7WvbBfE1qZTWTHE8Bwqb2M";
const STRANGER = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
const FUTURE = () => Date.now() + 60_000;

/** Cookie jar stub: only SESSION_COOKIE is defined, with the given sealed value. */
function jarWith(sealed: string | null) {
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === SESSION_COOKIE && sealed ? { value: sealed } : undefined,
  });
}

beforeEach(() => {
  vi.stubEnv("ATTENDANCE_CREATOR_WALLETS", `${ALLOWED},${OTHER}`);
  vi.stubEnv("ATTENDANCE_SESSION_SECRET", SECRET);
  getSessionUserMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getCreatorWallet", () => {
  it("valid cookie for an allowlisted wallet returns that wallet", async () => {
    jarWith(sealSession(ALLOWED, FUTURE(), SECRET));
    expect(await getCreatorWallet()).toBe(ALLOWED);
    // cookie path short-circuits before Privy
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it("valid cookie for a DE-allowlisted wallet is ignored, falls to Privy", async () => {
    // wallet was removed from ATTENDANCE_CREATOR_WALLETS since the cookie issued
    jarWith(sealSession(STRANGER, FUTURE(), SECRET));
    expect(await getCreatorWallet()).toBeNull();
    expect(getSessionUserMock).toHaveBeenCalled();
  });

  it("missing ATTENDANCE_SESSION_SECRET skips the cookie path entirely", async () => {
    vi.stubEnv("ATTENDANCE_SESSION_SECRET", "");
    jarWith(sealSession(ALLOWED, FUTURE(), SECRET));
    // even a perfectly valid cookie is unreadable without the secret → Privy only
    expect(await getCreatorWallet()).toBeNull();
    expect(getSessionUserMock).toHaveBeenCalled();
  });

  it("tampered cookie (bad MAC) does not authenticate", async () => {
    const good = sealSession(ALLOWED, FUTURE(), SECRET);
    jarWith(good.slice(0, -3) + "xyz"); // corrupt the signature
    expect(await getCreatorWallet()).toBeNull();
  });

  it("expired cookie does not authenticate", async () => {
    jarWith(sealSession(ALLOWED, Date.now() - 1_000, SECRET));
    expect(await getCreatorWallet()).toBeNull();
  });

  it("no cookie but Privy session with an allowlisted wallet returns it", async () => {
    jarWith(null);
    getSessionUserMock.mockResolvedValue({ wallets: [STRANGER, OTHER] });
    expect(await getCreatorWallet()).toBe(OTHER);
  });

  it("no cookie and Privy wallet not allowlisted returns null", async () => {
    jarWith(null);
    getSessionUserMock.mockResolvedValue({ wallets: [STRANGER] });
    expect(await getCreatorWallet()).toBeNull();
  });
});

describe("requireAttendanceCreator", () => {
  it("throws ATTENDANCE_NOT_CREATOR when no creator resolves", async () => {
    jarWith(null);
    await expect(requireAttendanceCreator()).rejects.toMatchObject({
      code: "ATTENDANCE_NOT_CREATOR",
    });
  });

  it("returns the wallet when a valid allowlisted cookie is present", async () => {
    jarWith(sealSession(ALLOWED, FUTURE(), SECRET));
    expect(await requireAttendanceCreator()).toBe(ALLOWED);
  });
});
