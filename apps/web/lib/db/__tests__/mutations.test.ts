import { afterEach, describe, expect, it, vi } from "vitest";

// Same shape as claim-verify-mutations.test.ts: the module reads its service
// env at import time, so each case re-imports it behind a mocked client.
const createClient = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const CERT = "Cert1111111111111111111111111111111111111111";
const SHA = "a1b2c3d4".repeat(8);

const savedEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

/** Captures what the module sends to `.update()`. */
function clientRecording(error: { message: string } | null = null): {
  updates: Array<Record<string, unknown>>;
} {
  const updates: Array<Record<string, unknown>> = [];
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn((patch: Record<string, unknown>) => {
    updates.push(patch);
    return { eq };
  });
  createClient.mockReturnValue({ from: vi.fn(() => ({ update })) });
  return { updates };
}

async function load(configured = true) {
  vi.resetModules();
  if (configured) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  return import("../mutations");
}

function snapshot(artifactHash?: Uint8Array) {
  return {
    status: "Claimed" as const,
    signedMask: 0b11,
    certNumber: 7n,
    asset: "Asset111111111111111111111111111111111111111",
    artifactHash,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key;
});

describe("syncCertificateMirrorFromChain", () => {
  it("reconciles sha256 with the hash the chain committed", async () => {
    const { updates } = clientRecording();
    const { syncCertificateMirrorFromChain } = await load();

    await syncCertificateMirrorFromChain(
      CERT,
      snapshot(Uint8Array.from(Buffer.from(SHA, "hex"))),
    );

    expect(updates[0].sha256).toBe(SHA);
    expect(updates[0].status).toBe("Claimed");
    expect(updates[0].cert_number).toBe(7);
  });

  it("leaves sha256 alone while the chain still holds 32 zero bytes", async () => {
    const { updates } = clientRecording();
    const { syncCertificateMirrorFromChain } = await load();

    await syncCertificateMirrorFromChain(CERT, snapshot(new Uint8Array(32)));

    // A pre-claim sync must not overwrite the prepared hash with zeros.
    expect(updates[0]).not.toHaveProperty("sha256");
  });

  it("leaves sha256 alone when the caller passes no hash at all", async () => {
    const { updates } = clientRecording();
    const { syncCertificateMirrorFromChain } = await load();

    await syncCertificateMirrorFromChain(CERT, snapshot());

    expect(updates[0]).not.toHaveProperty("sha256");
  });
});

describe("recordCertificateCluster", () => {
  it("stamps the network the claim was recorded on", async () => {
    const { updates } = clientRecording();
    const { recordCertificateCluster } = await load();

    await expect(recordCertificateCluster(CERT, "devnet")).resolves.toBe(true);
    expect(updates[0]).toEqual({ cluster: "devnet" });
  });

  it("reports failure instead of throwing when 0006 has not been applied", async () => {
    clientRecording({
      message: 'column "cluster" of relation "certificates" does not exist',
    });
    const { recordCertificateCluster } = await load();

    // The claim it belongs to has already confirmed on-chain; a missing
    // nice-to-have column may not turn that into an error.
    await expect(recordCertificateCluster(CERT, "devnet")).resolves.toBe(false);
  });

  it("is a no-op when Supabase is not configured", async () => {
    clientRecording();
    const { recordCertificateCluster } = await load(false);

    await expect(recordCertificateCluster(CERT, "devnet")).resolves.toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });
});
