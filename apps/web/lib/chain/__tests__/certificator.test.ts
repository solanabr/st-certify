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
      { editionAddress: "ed", certificateAddresses: certs },
    ]);
    expect(targets.map((t) => t.certificateAddresses.length)).toEqual([20, 5]);
    expect(targets.flatMap((t) => t.certificateAddresses)).toEqual(certs);
  });

  it("45 certs -> 3 chunks (20, 20, 5)", () => {
    const certs = Array.from({ length: 45 }, (_, i) => `c${i}`);
    const targets = mod.chunkCertificates([
      { editionAddress: "ed", certificateAddresses: certs },
    ]);
    expect(targets.map((t) => t.certificateAddresses.length)).toEqual([
      20, 20, 5,
    ]);
  });

  it("keeps editions separate and skips empty ones", () => {
    const targets = mod.chunkCertificates([
      { editionAddress: "a", certificateAddresses: ["1", "2"] },
      { editionAddress: "empty", certificateAddresses: [] },
      { editionAddress: "b", certificateAddresses: ["3"] },
    ]);
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.editionAddress)).toEqual(["a", "b"]);
  });
});

describe("buildSignBatchTxs (compile + size guard)", () => {
  it("packs 20 signs into one tx under 1232 bytes", async () => {
    const certs = Array.from({ length: 20 }, (_, i) => addr(i + 1));
    const plans = await mod.buildSignBatchTxs({
      signer: addr(200),
      groups: [{ editionAddress: addr(100), certificateAddresses: certs }],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].certificateAddresses).toHaveLength(20);
    expect(plans[0].wireBytes.length).toBeLessThan(1232);
    expect(plans[0].lastValidBlockHeight).toBe(100n);
  });

  it("splits 25 signs into 20 + 5, each under 1232 bytes, order preserved", async () => {
    const certs = Array.from({ length: 25 }, (_, i) => addr(i + 1));
    const plans = await mod.buildSignBatchTxs({
      signer: addr(200),
      groups: [{ editionAddress: addr(100), certificateAddresses: certs }],
    });
    expect(plans.map((p) => p.certificateAddresses.length)).toEqual([20, 5]);
    for (const p of plans) expect(p.wireBytes.length).toBeLessThan(1232);
    expect(plans.flatMap((p) => p.certificateAddresses)).toEqual(certs);
  });
});
