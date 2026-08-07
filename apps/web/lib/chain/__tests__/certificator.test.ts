import { beforeAll, describe, expect, it, vi } from "vitest";
import { getAddressDecoder } from "@solana/kit";

// Mock the RPC so buildSignBatchTxs gets a deterministic blockhash without a
// network call (the all-ones base58 = 32 zero bytes, a valid blockhash shape).
vi.mock("../rpc", () => ({
  rpcConfigured: true,
  getRpc: () => ({
    getLatestBlockhash: () => ({
      send: async () => ({
        value: {
          blockhash: "11111111111111111111111111111111",
          lastValidBlockHeight: 100n,
        },
      }),
    }),
  }),
}));

type Mod = typeof import("../certificator");
let mod: Mod;

beforeAll(async () => {
  // programDeployed is read at module load — set the env, then import.
  vi.stubEnv(
    "NEXT_PUBLIC_PROGRAM_ID",
    "5Wx1mNKSgtu1pnwHgLe5duYK9xcFhEhsd1zoeJi9EiUZ",
  );
  mod = await import("../certificator");
});

const addr = (n: number): string =>
  getAddressDecoder().decode(new Uint8Array(32).fill(n)) as string;

describe("chunkCertificates (pure 20/tx math)", () => {
  it("chunks 20 per edition, order preserved", () => {
    const certs = Array.from({ length: 25 }, (_, i) => `cert${i}`);
    const targets = mod.chunkCertificates([
      { editionAddress: "ed", signerWallet: "w1", certificateAddresses: certs },
    ]);
    expect(targets.map((t) => t.certificateAddresses.length)).toEqual([20, 5]);
    expect(targets.flatMap((t) => t.certificateAddresses)).toEqual(certs);
  });

  it("45 certs -> 3 chunks (20, 20, 5)", () => {
    const certs = Array.from({ length: 45 }, (_, i) => `c${i}`);
    const targets = mod.chunkCertificates([
      { editionAddress: "ed", signerWallet: "w1", certificateAddresses: certs },
    ]);
    expect(targets.map((t) => t.certificateAddresses.length)).toEqual([
      20, 20, 5,
    ]);
  });

  it("keeps editions separate and skips empty ones", () => {
    const targets = mod.chunkCertificates([
      {
        editionAddress: "a",
        signerWallet: "w1",
        certificateAddresses: ["1", "2"],
      },
      { editionAddress: "empty", signerWallet: "w1", certificateAddresses: [] },
      { editionAddress: "b", signerWallet: "w2", certificateAddresses: ["3"] },
    ]);
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.editionAddress)).toEqual(["a", "b"]);
  });

  it("carries each group's own signerWallet through, not a shared one", () => {
    const targets = mod.chunkCertificates([
      {
        editionAddress: "a",
        signerWallet: "walletA",
        certificateAddresses: ["1"],
      },
      {
        editionAddress: "b",
        signerWallet: "walletB",
        certificateAddresses: ["2"],
      },
    ]);
    expect(targets.map((t) => t.signerWallet)).toEqual(["walletA", "walletB"]);
  });
});

describe("buildSignBatchTxs (compile + size guard)", () => {
  it("packs 20 signs into one tx under 1232 bytes", async () => {
    const certs = Array.from({ length: 20 }, (_, i) => addr(i + 1));
    const plans = await mod.buildSignBatchTxs({
      groups: [
        {
          editionAddress: addr(100),
          signerWallet: addr(200),
          certificateAddresses: certs,
        },
      ],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].certificateAddresses).toHaveLength(20);
    expect(plans[0].wireBytes.length).toBeLessThan(1232);
    expect(plans[0].lastValidBlockHeight).toBe(100n);
    expect(plans[0].signerWallet).toBe(addr(200));
  });

  it("splits 25 signs into 20 + 5, each under 1232 bytes, order preserved", async () => {
    const certs = Array.from({ length: 25 }, (_, i) => addr(i + 1));
    const plans = await mod.buildSignBatchTxs({
      groups: [
        {
          editionAddress: addr(100),
          signerWallet: addr(200),
          certificateAddresses: certs,
        },
      ],
    });
    expect(plans.map((p) => p.certificateAddresses.length)).toEqual([20, 5]);
    for (const p of plans) expect(p.wireBytes.length).toBeLessThan(1232);
    expect(plans.flatMap((p) => p.certificateAddresses)).toEqual(certs);
  });

  it("keeps each edition's own signer wallet on every resulting chunk", async () => {
    const plans = await mod.buildSignBatchTxs({
      groups: [
        {
          editionAddress: addr(100),
          signerWallet: addr(201),
          certificateAddresses: [addr(1), addr(2)],
        },
        {
          editionAddress: addr(101),
          signerWallet: addr(202),
          certificateAddresses: [addr(3)],
        },
      ],
    });
    expect(plans).toHaveLength(2);
    expect(
      plans.find((p) => p.editionAddress === addr(100))?.signerWallet,
    ).toBe(addr(201));
    expect(
      plans.find((p) => p.editionAddress === addr(101))?.signerWallet,
    ).toBe(addr(202));
  });

  it("forces the recursive byte-size guard to actually split a chunk", async () => {
    // 20 certs comfortably fit under the real 1232 B ceiling (see the test
    // above), so the split branch of compileWithGuard never fires against the
    // production limit. Measure one real chunk size empirically, then pass an
    // artificially tight `maxTxBytes` (just above a proven-fitting 10-cert
    // chunk, still below the 20-cert chunk) so 20 certs are FORCED to recurse
    // — this exercises the split, not just the count-based chunker above.
    const certs10 = Array.from({ length: 10 }, (_, i) => addr(i + 1));
    const certs20 = Array.from({ length: 20 }, (_, i) => addr(i + 1));

    const baseline10 = await mod.buildSignBatchTxs({
      groups: [
        {
          editionAddress: addr(100),
          signerWallet: addr(200),
          certificateAddresses: certs10,
        },
      ],
    });
    const size10 = baseline10[0].wireBytes.length;

    const plans = await mod.buildSignBatchTxs({
      groups: [
        {
          editionAddress: addr(100),
          signerWallet: addr(200),
          certificateAddresses: certs20,
        },
      ],
      maxTxBytes: size10 + 1,
    });

    // A single 20-cert chunk no longer fits under the artificial ceiling —
    // the guard must have recursed (Math.ceil(20/2) = 10) rather than
    // returning one oversized plan.
    expect(plans.map((p) => p.certificateAddresses.length)).toEqual([10, 10]);
    for (const p of plans) {
      expect(p.wireBytes.length).toBeLessThanOrEqual(size10 + 1);
    }
    expect(plans.flatMap((p) => p.certificateAddresses)).toEqual(certs20);
  });

  it("throws VALIDATION when even a single cert exceeds the byte ceiling", async () => {
    await expect(
      mod.buildSignBatchTxs({
        groups: [
          {
            editionAddress: addr(100),
            signerWallet: addr(200),
            certificateAddresses: [addr(1)],
          },
        ],
        maxTxBytes: 1,
      }),
    ).rejects.toThrow(/1232 bytes/);
  });
});
