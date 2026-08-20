import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRpcUrl } from "../rpc";

const KEY = "helius-test-key-123";
const DEVNET = "https://api.devnet.solana.com";
const MAINNET = "https://api.mainnet-beta.solana.com";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resolveRpcUrl", () => {
  it("prefers Helius devnet when the key is set and the public URL is devnet", () => {
    vi.stubEnv("HELIUS_API_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_RPC_URL", DEVNET);

    expect(resolveRpcUrl()).toBe(
      `https://devnet.helius-rpc.com/?api-key=${KEY}`,
    );
  });

  it("prefers Helius mainnet when the public URL is not devnet", () => {
    vi.stubEnv("HELIUS_API_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_RPC_URL", MAINNET);

    expect(resolveRpcUrl()).toBe(
      `https://mainnet.helius-rpc.com/?api-key=${KEY}`,
    );
  });

  it("defaults to Helius devnet when the public URL is unset", () => {
    vi.stubEnv("HELIUS_API_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_RPC_URL", undefined);

    expect(resolveRpcUrl()).toBe(
      `https://devnet.helius-rpc.com/?api-key=${KEY}`,
    );
  });

  it("falls back to NEXT_PUBLIC_RPC_URL when no key is configured", () => {
    vi.stubEnv("HELIUS_API_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_RPC_URL", DEVNET);

    expect(resolveRpcUrl()).toBe(DEVNET);
  });

  it("returns empty string when neither the key nor the public URL is set", () => {
    vi.stubEnv("HELIUS_API_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_RPC_URL", undefined);

    expect(resolveRpcUrl()).toBe("");
  });

  it("never emits the key in a browser context", () => {
    // Stands in for the server-only guard this module can't carry: several
    // client components import it (see the note atop lib/chain/rpc.ts).
    vi.stubEnv("HELIUS_API_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_RPC_URL", DEVNET);
    vi.stubGlobal("window", {});

    const url = resolveRpcUrl();
    expect(url).toBe(DEVNET);
    expect(url).not.toContain(KEY);
  });
});
