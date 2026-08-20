import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked BEFORE importing the module under test, per vitest's hoisting contract
// (mirrors lib/db/__tests__/attendance-mutations.test.ts). Everything mint.ts
// touches on the wire is stubbed so the test can assert pure ordering.
vi.mock("@metaplex-foundation/umi", () => ({
  generateSigner: vi.fn(() => ({ publicKey: { toString: () => ASSET } })),
  publicKey: vi.fn((value: string) => value),
}));

vi.mock("@metaplex-foundation/mpl-core", () => ({
  burn: vi.fn(),
  create: vi.fn(),
  fetchAsset: vi.fn(),
  fetchCollection: vi.fn(),
}));

vi.mock("@/lib/db/mutations", () => ({
  dbConfigured: true,
  logEvent: vi.fn(),
}));

vi.mock("@/lib/db/claim-verify-mutations", () => ({
  getMintedAssetFromEvents: vi.fn(),
}));

vi.mock("@/lib/chain/umi", () => ({
  getOperatorUmi: vi.fn(() => ({ identity: { publicKey: OPERATOR } })),
  // The real one retries; here it is a pass-through so a rejection surfaces
  // immediately as the caller would eventually see it.
  retryFetch: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

const ASSET = "Asset111111111111111111111111111111111111111";
const OPERATOR = "Oper1111111111111111111111111111111111111111";
const CERT = "Cert1111111111111111111111111111111111111111";

process.env.CORE_COLLECTION_ADDRESS =
  "Coll1111111111111111111111111111111111111111";

const { create, fetchAsset, fetchCollection } =
  await import("@metaplex-foundation/mpl-core");
const { logEvent } = await import("@/lib/db/mutations");
const { getMintedAssetFromEvents } =
  await import("@/lib/db/claim-verify-mutations");
const { mintCertificateAsset } = await import("../mint");

const INPUT = {
  certificateAddress: CERT,
  editionId: "1",
  editionName: "Edição A",
  certNumber: 7,
  owner: "Stud111111111111111111111111111111111111111",
  artifactSha256Hex: "ab".repeat(32),
  verifyUrl: `https://certify.test/verify/${CERT}`,
  metadataUri: "https://storage.test/metadata.json",
};

/** Records the order in which the post-mint steps run. */
let steps: string[];
let sendAndConfirm: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  steps = [];

  vi.mocked(getMintedAssetFromEvents).mockResolvedValue(null);
  vi.mocked(fetchCollection).mockResolvedValue({
    publicKey: "collection",
  } as never);
  vi.mocked(fetchAsset).mockImplementation(async () => {
    steps.push("visibility");
    return { publicKey: ASSET } as never;
  });
  vi.mocked(logEvent).mockImplementation(async () => {
    steps.push("event");
  });

  sendAndConfirm = vi.fn(async () => {
    steps.push("mint");
    return { signature: new Uint8Array(64) };
  });
  vi.mocked(create).mockReturnValue({ sendAndConfirm } as never);
});

describe("mintCertificateAsset", () => {
  it("persists the idempotency event before waiting for asset visibility", async () => {
    await expect(mintCertificateAsset(INPUT)).resolves.toBe(ASSET);

    expect(steps).toEqual(["mint", "event", "visibility"]);
    expect(vi.mocked(logEvent).mock.calls[0][0]).toMatchObject({
      type: "certificate_asset_minted",
      certAddress: CERT,
      payload: { asset: ASSET },
    });
  });

  it("keeps the recorded asset when the visibility wait fails", async () => {
    vi.mocked(fetchAsset).mockRejectedValue(new Error("rpc lag"));

    await expect(mintCertificateAsset(INPUT)).resolves.toBe(ASSET);
    expect(logEvent).toHaveBeenCalledTimes(1);
  });

  it("retries a transient event write and does not mint twice", async () => {
    vi.mocked(logEvent)
      .mockRejectedValueOnce(new Error("insert failed"))
      .mockImplementation(async () => {
        steps.push("event");
      });

    await expect(mintCertificateAsset(INPUT)).resolves.toBe(ASSET);

    expect(logEvent).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(steps).toEqual(["mint", "event", "visibility"]);
  });

  it("reuses a previously minted asset instead of minting again", async () => {
    vi.mocked(getMintedAssetFromEvents).mockResolvedValue(ASSET);

    await expect(mintCertificateAsset(INPUT)).resolves.toBe(ASSET);
    expect(create).not.toHaveBeenCalled();
  });

  // The pairing that closes the duplicate window: an unreadable guard aborts
  // BEFORE any operator-paid mint, rather than reading as "never minted".
  it("aborts without minting when the idempotency guard cannot be read", async () => {
    vi.mocked(getMintedAssetFromEvents).mockRejectedValue(
      new Error("supabase down"),
    );

    await expect(mintCertificateAsset(INPUT)).rejects.toThrow("supabase down");
    expect(create).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});
