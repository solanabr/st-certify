import { afterEach, describe, expect, it, vi } from "vitest";

// The module under test builds its own service client at import time from env,
// so each case re-imports it with the env it needs (vitest hoists this mock
// above those dynamic imports).
const createClient = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const CERT = "Cert1111111111111111111111111111111111111111";
const ASSET = "Asset111111111111111111111111111111111111111";

const savedEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

/** Re-imports the module with (or without) service-role env configured. */
async function load(configured: boolean) {
  vi.resetModules();
  if (configured) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  return import("../claim-verify-mutations");
}

/** A client whose events query bottoms out in the given maybeSingle result. */
function clientYielding(result: {
  data: unknown;
  error: { message: string } | null;
}): void {
  const chain: Record<string, unknown> = {
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  for (const method of ["select", "eq", "order", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  createClient.mockReturnValue({ from: vi.fn(() => chain) });
}

afterEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key;
});

describe("getMintedAssetFromEvents", () => {
  it("returns the asset from a prior mint event", async () => {
    clientYielding({ data: { payload: { asset: ASSET } }, error: null });
    const { getMintedAssetFromEvents } = await load(true);

    await expect(getMintedAssetFromEvents(CERT)).resolves.toBe(ASSET);
  });

  it("returns null when the cert genuinely has no mint event", async () => {
    clientYielding({ data: null, error: null });
    const { getMintedAssetFromEvents } = await load(true);

    await expect(getMintedAssetFromEvents(CERT)).resolves.toBeNull();
  });

  it("returns null when an event exists but carries no asset address", async () => {
    clientYielding({ data: { payload: {} }, error: null });
    const { getMintedAssetFromEvents } = await load(true);

    await expect(getMintedAssetFromEvents(CERT)).resolves.toBeNull();
  });

  // The duplicate-mint guard: "cannot tell" must never read as "never minted".
  it("throws a retryable error on a query failure instead of returning null", async () => {
    clientYielding({ data: null, error: { message: "connection reset" } });
    const { getMintedAssetFromEvents } = await load(true);

    await expect(getMintedAssetFromEvents(CERT)).rejects.toMatchObject({
      code: "INTERNAL",
      retryable: true,
      detail: "connection reset",
    });
  });

  it("throws a retryable error when the service client is unconfigured", async () => {
    const { getMintedAssetFromEvents } = await load(false);

    await expect(getMintedAssetFromEvents(CERT)).rejects.toMatchObject({
      code: "INTERNAL",
      retryable: true,
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});
