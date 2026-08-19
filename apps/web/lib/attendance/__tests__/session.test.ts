import { describe, expect, it } from "vitest";
import { openSession, sealSession } from "../session";

const SECRET = "test-secret-please-rotate";
const WALLET = "ENn4h8RZGXfXhmU6LQKZtujWjddpvYhT4NXWhNacvHsb";

describe("session cookie", () => {
  it("round-trips", () => {
    const sealed = sealSession(WALLET, Date.now() + 60_000, SECRET);
    expect(openSession(sealed, SECRET)).toEqual({ wallet: WALLET });
  });

  it("rejects tampering, wrong secret, and expiry", () => {
    const sealed = sealSession(WALLET, Date.now() + 60_000, SECRET);
    expect(openSession(sealed.slice(0, -2) + "xx", SECRET)).toBeNull();
    expect(openSession(sealed, "other-secret")).toBeNull();
    const expired = sealSession(WALLET, Date.now() - 1, SECRET);
    expect(openSession(expired, SECRET)).toBeNull();
    expect(openSession("garbage", SECRET)).toBeNull();
  });
});
