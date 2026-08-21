import { describe, expect, it } from "vitest";
import { pipelineState, type PipelineInput } from "../pipeline-state";

function cert(patch: Partial<PipelineInput> = {}): PipelineInput {
  return { status: "Requested", signerBitmap: 0, signerCount: 3, ...patch };
}

describe("pipelineState", () => {
  it("puts a fresh request at the start with no signatures", () => {
    expect(pipelineState(cert())).toEqual({
      stage: "requested",
      signed: 0,
      total: 3,
    });
  });

  it("moves to signing as soon as one signer has signed", () => {
    expect(pipelineState(cert({ signerBitmap: 0b010 }))).toEqual({
      stage: "signing",
      signed: 1,
      total: 3,
    });
  });

  it("counts each set position, not the bitmap's numeric value", () => {
    expect(pipelineState(cert({ signerBitmap: 0b101 })).signed).toBe(2);
  });

  // A mirror that lags a signer removal would otherwise report 4/3 signed.
  it("ignores bits above the edition's signer count", () => {
    expect(pipelineState(cert({ signerBitmap: 0b1111 }))).toEqual({
      stage: "signing",
      signed: 3,
      total: 3,
    });
  });

  it("reports ready once the chain marks it fully signed", () => {
    expect(
      pipelineState(cert({ status: "FullySigned", signerBitmap: 0b111 })),
    ).toEqual({ stage: "ready", signed: 3, total: 3 });
  });

  it("reports issued for a claimed certificate", () => {
    expect(
      pipelineState(cert({ status: "Claimed", signerBitmap: 0b111 })).stage,
    ).toBe("issued");
  });

  // Terminal states win over signature progress: a revoked certificate that
  // was fully signed is revoked, not issued.
  it.each([
    ["Revoked", "revoked"],
    ["Rejected", "rejected"],
  ] as const)("treats %s as terminal", (status, stage) => {
    expect(pipelineState(cert({ status, signerBitmap: 0b111 })).stage).toBe(
      stage,
    );
  });

  it("survives an edition with no signers on record", () => {
    expect(pipelineState(cert({ signerCount: 0, signerBitmap: 0b11 }))).toEqual(
      {
        stage: "requested",
        signed: 0,
        total: 0,
      },
    );
  });
});
