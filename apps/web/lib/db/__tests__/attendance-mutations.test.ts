import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mocked BEFORE importing the module under test, per vitest's hoisting
// contract (mirrors lib/chain/__tests__/server.test.ts). markClaimMinted
// bottoms out in supabase.from(...).update(...).eq(...), so the fake client
// only has to carry that one chain.
vi.mock("../mutations", () => ({
  dbConfigured: true,
  getServiceClient: vi.fn(),
}));

const { getServiceClient } = await import("../mutations");
const { markClaimMintedWithRetry } = await import("../attendance-mutations");

const CLAIM_ID = "claim-1";
const TX_SIG = "5xTxSignature";
const WALLET = "8xWalletAddress";

/** Installs a client whose update resolves the given results, in order. */
function clientYielding(
  ...results: Array<{ error: { message: string } | null }>
): ReturnType<typeof vi.fn> {
  const eq = vi.fn();
  for (const result of results) eq.mockResolvedValueOnce(result);
  vi.mocked(getServiceClient).mockReturnValue({
    from: () => ({ update: () => ({ eq }) }),
  } as unknown as SupabaseClient);
  return eq;
}

const noSleep = vi.fn(async () => {});

describe("markClaimMintedWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the mint on the first attempt", async () => {
    const eq = clientYielding({ error: null });

    const ok = await markClaimMintedWithRetry(
      { claimId: CLAIM_ID, txSig: TX_SIG, wallet: WALLET },
      { sleep: noSleep },
    );

    expect(ok).toBe(true);
    expect(eq).toHaveBeenCalledTimes(1);
    expect(noSleep).not.toHaveBeenCalled();
  });

  it("retries a transient failure and reports success without logging", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const eq = clientYielding(
      { error: { message: "connection reset" } },
      { error: null },
    );

    const ok = await markClaimMintedWithRetry(
      { claimId: CLAIM_ID, txSig: TX_SIG, wallet: WALLET },
      { sleep: noSleep },
    );

    expect(ok).toBe(true);
    expect(eq).toHaveBeenCalledTimes(2);
    expect(noSleep).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("backs off exponentially between attempts", async () => {
    clientYielding(
      { error: { message: "down" } },
      { error: { message: "down" } },
      { error: null },
    );

    await markClaimMintedWithRetry(
      { claimId: CLAIM_ID, txSig: TX_SIG, wallet: WALLET },
      { delayMs: 10, sleep: noSleep },
    );

    expect(noSleep.mock.calls).toEqual([[10], [20]]);
  });

  it("gives up after the configured attempts and logs a reconciliation line — never throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const eq = clientYielding(
      { error: { message: "db down" } },
      { error: { message: "db down" } },
      { error: { message: "db down" } },
    );

    const ok = await markClaimMintedWithRetry(
      { claimId: CLAIM_ID, txSig: TX_SIG, wallet: WALLET },
      { attempts: 3, sleep: noSleep },
    );

    expect(ok).toBe(false);
    expect(eq).toHaveBeenCalledTimes(3);

    const [line, detail] = errorSpy.mock.calls[0];
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(line).toContain("[attendance:reconcile]");
    expect(line).toContain(`claimId=${CLAIM_ID}`);
    expect(line).toContain(`txSig=${TX_SIG}`);
    expect(line).toContain(`wallet=${WALLET}`);
    expect(line).toContain("assetId=unresolved");
    expect(detail).toBe("Falha ao registrar emissão.");
    errorSpy.mockRestore();
  });

  it("includes a known assetId in the reconciliation line", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    clientYielding({ error: { message: "db down" } });

    await markClaimMintedWithRetry(
      {
        claimId: CLAIM_ID,
        txSig: TX_SIG,
        wallet: WALLET,
        assetId: "AssetAddress111",
      },
      { attempts: 1, sleep: noSleep },
    );

    expect(errorSpy.mock.calls[0][0]).toContain("assetId=AssetAddress111");
    errorSpy.mockRestore();
  });
});
