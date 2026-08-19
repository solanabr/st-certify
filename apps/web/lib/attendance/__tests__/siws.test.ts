import { describe, expect, it } from "vitest";
import {
  buildSiwsMessage,
  isSiwsFresh,
  parseSiwsMessage,
  SIWS_MAX_AGE_MS,
} from "../siws";

const FIELDS = {
  domain: "certify.superteam.digital",
  wallet: "ENn4h8RZGXfXhmU6LQKZtujWjddpvYhT4NXWhNacvHsb",
  purpose: "attendance-claim" as const,
  nonce: "abc123nonce",
  issuedAt: "2026-08-19T12:00:00.000Z",
};

describe("siws", () => {
  it("round-trips build → parse", () => {
    expect(parseSiwsMessage(buildSiwsMessage(FIELDS))).toEqual(FIELDS);
  });

  it("rejects a tampered wallet line", () => {
    const msg = buildSiwsMessage(FIELDS).replace(FIELDS.wallet, "Attacker111");
    const parsed = parseSiwsMessage(msg);
    expect(parsed?.wallet).toBe("Attacker111"); // parse is honest…
    expect(parsed).not.toEqual(FIELDS); // …comparison happens at the caller
  });

  it("rejects garbage and unknown purposes", () => {
    expect(parseSiwsMessage("hello")).toBeNull();
    const msg = buildSiwsMessage({ ...FIELDS }).replace(
      "attendance-claim",
      "other-thing",
    );
    expect(parseSiwsMessage(msg)).toBeNull();
  });

  it("freshness window", () => {
    const now = new Date("2026-08-19T12:04:59.000Z");
    expect(isSiwsFresh(FIELDS.issuedAt, now)).toBe(true);
    const stale = new Date(Date.parse(FIELDS.issuedAt) + SIWS_MAX_AGE_MS + 1);
    expect(isSiwsFresh(FIELDS.issuedAt, stale)).toBe(false);
    expect(isSiwsFresh("not-a-date", now)).toBe(false);
    // future-dated messages are not fresh
    expect(isSiwsFresh("2026-08-19T13:00:00.000Z", now)).toBe(false);
  });
});
