import { describe, it, expect } from "vitest";
import { classifyVerifyInput, reconcileChainVerdict } from "@/lib/chain/verify";

const ADDR = "5Wx1mNKSgtu1pnwHgLe5duYK9xcFhEhsd1zoeJi9EiUZ";

describe("classifyVerifyInput", () => {
  it("treats blank input as empty", () => {
    expect(classifyVerifyInput("   ").kind).toBe("empty");
  });

  it("classifies a 64-hex string as a hash (lowercased)", () => {
    expect(classifyVerifyInput("A".repeat(64))).toEqual({
      kind: "hash",
      value: "a".repeat(64),
    });
  });

  it("classifies a base58 address (cert PDA or asset)", () => {
    expect(classifyVerifyInput(ADDR)).toEqual({ kind: "base58", value: ADDR });
  });

  it("unwraps a /verify/<id> URL to the id and re-classifies", () => {
    expect(
      classifyVerifyInput(`https://superteam.com.br/verify/${ADDR}?x=1`),
    ).toEqual({ kind: "base58", value: ADDR });
  });

  it("unwraps a /verify/<hash> URL to a hash", () => {
    const h = "b".repeat(64);
    expect(classifyVerifyInput(`http://localhost:3000/verify/${h}`)).toEqual({
      kind: "hash",
      value: h,
    });
  });

  it("rejects garbage as unknown", () => {
    expect(classifyVerifyInput("not an address!!").kind).toBe("unknown");
  });
});

describe("reconcileChainVerdict (back-reference + drift)", () => {
  it("shows the NFT link only when the chain asset is present", () => {
    expect(
      reconcileChainVerdict({
        exists: true,
        chainStatus: "Claimed",
        chainAsset: "AssetXyz",
        mirrorStatus: "Claimed",
      }),
    ).toEqual({ showNftLink: true, nftAsset: "AssetXyz", drifted: false });

    expect(
      reconcileChainVerdict({
        exists: true,
        chainStatus: "Claimed",
        chainAsset: null,
        mirrorStatus: "Claimed",
      }).showNftLink,
    ).toBe(false);
  });

  it("never shows a link when the cert does not exist on-chain", () => {
    expect(
      reconcileChainVerdict({
        exists: false,
        chainStatus: "NotFound",
        chainAsset: "AssetXyz",
        mirrorStatus: "Claimed",
      }).showNftLink,
    ).toBe(false);
  });

  it("flags drift when the chain is ahead of the mirror", () => {
    expect(
      reconcileChainVerdict({
        exists: true,
        chainStatus: "Claimed",
        chainAsset: "AssetXyz",
        mirrorStatus: "FullySigned",
      }).drifted,
    ).toBe(true);

    expect(
      reconcileChainVerdict({
        exists: true,
        chainStatus: "Revoked",
        chainAsset: null,
        mirrorStatus: "Claimed",
      }).drifted,
    ).toBe(true);
  });

  it("no drift when chain and mirror agree", () => {
    expect(
      reconcileChainVerdict({
        exists: true,
        chainStatus: "Claimed",
        chainAsset: "AssetXyz",
        mirrorStatus: "Claimed",
      }).drifted,
    ).toBe(false);
  });
});
