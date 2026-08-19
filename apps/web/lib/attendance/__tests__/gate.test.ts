import { describe, expect, it } from "vitest";
import { checkClaimGate } from "../gate";

const NOW = new Date("2026-08-19T12:00:00Z");

describe("checkClaimGate", () => {
  it("open event with no deadline passes", () => {
    expect(
      checkClaimGate({ claim_open: true, claim_deadline: null }, NOW),
    ).toEqual({ ok: true });
  });

  it("paused event fails ATTENDANCE_CLOSED", () => {
    const r = checkClaimGate({ claim_open: false, claim_deadline: null }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ATTENDANCE_CLOSED");
  });

  it("passed deadline fails, future deadline passes", () => {
    expect(
      checkClaimGate(
        { claim_open: true, claim_deadline: "2026-08-19T11:59:59Z" },
        NOW,
      ).ok,
    ).toBe(false);
    expect(
      checkClaimGate(
        { claim_open: true, claim_deadline: "2026-08-19T12:00:01Z" },
        NOW,
      ).ok,
    ).toBe(true);
  });
});
