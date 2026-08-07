import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { computeNameCommitment } from "@/lib/commitment";
import {
  claimSubmitPlan,
  nameCommitmentMatches,
} from "@/lib/chain/claim-logic";

describe("nameCommitmentMatches (notary gate)", () => {
  const salt = randomBytes(32);
  const saltHex = salt.toString("hex");
  const name = "Maria da Silva";
  const commitment = new Uint8Array(computeNameCommitment(salt, name));

  it("matches when salt + name reproduce the on-chain commitment", () => {
    expect(nameCommitmentMatches(saltHex, name, commitment)).toBe(true);
  });

  it("refuses a different name (impersonation attempt)", () => {
    expect(nameCommitmentMatches(saltHex, "Maria da Silvo", commitment)).toBe(
      false,
    );
  });

  it("refuses a different salt", () => {
    const otherSalt = randomBytes(32).toString("hex");
    expect(nameCommitmentMatches(otherSalt, name, commitment)).toBe(false);
  });

  it("refuses an empty salt", () => {
    expect(nameCommitmentMatches("", name, commitment)).toBe(false);
  });
});

describe("claimSubmitPlan (idempotent step skipping)", () => {
  it("FullySigned → confirm, then mint + record", () => {
    expect(claimSubmitPlan({ status: "FullySigned", hasAsset: false })).toEqual(
      {
        needsConfirm: true,
        needsMintAndRecord: true,
      },
    );
  });

  it("Claimed without asset → skip confirm, still mint + record (resumed after partial failure)", () => {
    expect(claimSubmitPlan({ status: "Claimed", hasAsset: false })).toEqual({
      needsConfirm: false,
      needsMintAndRecord: true,
    });
  });

  it("Claimed with asset → nothing left (fully re-POST-safe)", () => {
    expect(claimSubmitPlan({ status: "Claimed", hasAsset: true })).toEqual({
      needsConfirm: false,
      needsMintAndRecord: false,
    });
  });
});
