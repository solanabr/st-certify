import { describe, expect, it, vi } from "vitest";
import {
  connectWallet,
  getSolanaSignerWallets,
  signMessageWith,
} from "../features";

function fakeWallet(
  features: Record<string, unknown>,
  chains = ["solana:devnet"],
) {
  return {
    name: "Fake",
    icon: "data:image/svg+xml;base64,",
    chains,
    accounts: [],
    features,
    version: "1.0.0",
  } as never;
}

describe("wallet features", () => {
  it("filters to solana wallets that can connect and sign messages", () => {
    const good = fakeWallet({
      "standard:connect": {},
      "solana:signMessage": {},
    });
    const noSign = fakeWallet({ "standard:connect": {} });
    const evm = fakeWallet(
      { "standard:connect": {}, "solana:signMessage": {} },
      ["eip155:1"],
    );
    expect(getSolanaSignerWallets([good, noSign, evm])).toEqual([good]);
  });

  it("connectWallet returns accounts; signMessageWith returns the signature", async () => {
    const account = { address: "abc" };
    const signature = new Uint8Array([1, 2, 3]);
    const connect = vi.fn(async () => ({ accounts: [account] }));
    const signMessage = vi.fn(async () => [
      { signedMessage: new Uint8Array(), signature },
    ]);
    const w = fakeWallet({
      "standard:connect": { connect },
      "solana:signMessage": { signMessage },
    });
    await expect(connectWallet(w)).resolves.toEqual([account]);
    await expect(
      signMessageWith(w, account as never, new Uint8Array([9])),
    ).resolves.toBe(signature);
    expect(signMessage).toHaveBeenCalledWith({
      account,
      message: new Uint8Array([9]),
    });
  });
});
