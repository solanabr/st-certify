import { describe, expect, it } from "vitest";
import {
  attemptResolve,
  statusForOutcome,
  type ResolveOutcome,
} from "../verify-outcome";

/**
 * The public verify tool must never answer "não encontrado" because it could
 * not reach the RPC — an outage is a system error, a miss is a verdict.
 */
describe("statusForOutcome", () => {
  it("maps a clean null resolution to notfound", () => {
    expect(statusForOutcome({ kind: "miss" })).toBe("notfound");
  });

  it("maps a system failure to error, not notfound", () => {
    expect(statusForOutcome({ kind: "failed" })).toBe("error");
  });

  it("keeps the spinner up while navigating to a hit", () => {
    expect(statusForOutcome({ kind: "hit", certId: "Cert111" })).toBe("busy");
  });
});

describe("attemptResolve", () => {
  it("passes a resolved outcome through untouched", async () => {
    const hit: ResolveOutcome = { kind: "hit", certId: "Cert111" };
    await expect(attemptResolve(async () => hit)).resolves.toEqual(hit);
    await expect(
      attemptResolve(async () => ({ kind: "miss" })),
    ).resolves.toEqual({ kind: "miss" });
  });

  it("turns a thrown RPC failure into failed, which renders as error", async () => {
    const outcome = await attemptResolve(() => {
      throw new Error("fetch failed");
    });

    expect(outcome).toEqual({ kind: "failed" });
    expect(statusForOutcome(outcome)).toBe("error");
  });

  it("turns a rejected resolve into failed", async () => {
    const outcome = await attemptResolve(() =>
      Promise.reject(new Error("503 from rpc")),
    );

    expect(statusForOutcome(outcome)).toBe("error");
  });
});
