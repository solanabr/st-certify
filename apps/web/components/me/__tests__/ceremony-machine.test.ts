import { describe, expect, it } from "vitest";
import {
  canStartClaim,
  ceremonyStage,
  hasSufficientBalance,
  MIN_CLAIM_LAMPORTS,
  type CeremonyState,
} from "../ceremony-machine";

/** A fresh, fully-signed certificate whose owner has just opened the card. */
const FRESH: CeremonyState = {
  consented: false,
  balanceLamports: MIN_CLAIM_LAMPORTS,
  claimStage: "idle",
  claimed: false,
  assetRecorded: false,
};

function state(overrides: Partial<CeremonyState>): CeremonyState {
  return { ...FRESH, ...overrides };
}

describe("ceremonyStage", () => {
  it("opens on consent and will not sign until the visitor accepts", () => {
    expect(ceremonyStage(FRESH)).toBe("consent");
    expect(canStartClaim(FRESH)).toBe(false);
  });

  it("advances consent → signing → issuing → done", () => {
    const consented = state({ consented: true });
    expect(ceremonyStage(consented)).toBe("signing");
    expect(canStartClaim(consented)).toBe(true);

    expect(ceremonyStage({ ...consented, claimStage: "rendering" })).toBe(
      "signing",
    );
    expect(ceremonyStage({ ...consented, claimStage: "signing" })).toBe(
      "signing",
    );
    expect(ceremonyStage({ ...consented, claimStage: "confirming" })).toBe(
      "issuing",
    );
    expect(ceremonyStage({ ...consented, claimed: true })).toBe("issuing");
    expect(
      ceremonyStage({ ...consented, claimed: true, assetRecorded: true }),
    ).toBe("done");
  });

  it("never starts a second claim while one is in flight", () => {
    expect(
      canStartClaim(state({ consented: true, claimStage: "signing" })),
    ).toBe(false);
    expect(canStartClaim(state({ consented: true, claimed: true }))).toBe(
      false,
    );
  });

  // The reveal is the payoff: a claimed certificate must not fall back to the
  // consent screen just because this session never ticked the box.
  it("keeps a claimed certificate at done regardless of local consent", () => {
    expect(
      ceremonyStage(
        state({ consented: false, claimed: true, assetRecorded: true }),
      ),
    ).toBe("done");
  });
});

describe("low-balance branch", () => {
  it("gates a consented claim when the fee payer is short", () => {
    const broke = state({
      consented: true,
      balanceLamports: MIN_CLAIM_LAMPORTS - 1n,
    });

    expect(ceremonyStage(broke)).toBe("lowBalance");
    expect(canStartClaim(broke)).toBe(false);
  });

  it("clears the gate once an airdrop lands", () => {
    expect(
      ceremonyStage(
        state({ consented: true, balanceLamports: MIN_CLAIM_LAMPORTS }),
      ),
    ).toBe("signing");
  });

  // An RPC read failure is not evidence of an empty wallet.
  it("does not gate on an unknown balance", () => {
    expect(hasSufficientBalance(undefined)).toBe(true);
    expect(
      ceremonyStage(state({ consented: true, balanceLamports: undefined })),
    ).toBe("signing");
  });

  it("shows consent before the balance gate on a fresh card", () => {
    expect(ceremonyStage(state({ balanceLamports: 0n }))).toBe("consent");
  });
});
