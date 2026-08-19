import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "attendance_session";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function hmac(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

/** `base64url(wallet|expMs).base64url(hmac)` — no PII, nothing to decrypt. */
export function sealSession(
  wallet: string,
  expiresAtMs: number,
  secret: string,
): string {
  const payload = Buffer.from(`${wallet}|${expiresAtMs}`).toString("base64url");
  return `${payload}.${hmac(payload, secret).toString("base64url")}`;
}

export function openSession(
  sealed: string,
  secret: string,
  now: Date = new Date(),
): { wallet: string } | null {
  const [payload, mac] = sealed.split(".");
  if (!payload || !mac) return null;
  let given: Buffer;
  try {
    given = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  const expected = hmac(payload, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  const [wallet, expRaw] = Buffer.from(payload, "base64url")
    .toString()
    .split("|");
  const exp = Number(expRaw);
  if (!wallet || !Number.isFinite(exp) || now.getTime() >= exp) return null;
  return { wallet };
}
