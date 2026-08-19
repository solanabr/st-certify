import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeBase58, verifyWalletSignature } from "../verify-signature";

// base58-encode for the test only (inverse of decodeBase58)
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(bytes: Uint8Array): string {
  let n = BigInt(0);
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out;
}

describe("verifyWalletSignature", () => {
  it("accepts a valid signature and rejects tampering", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const raw = new Uint8Array(
      publicKey.export({ format: "der", type: "spki" }).subarray(-32),
    );
    const wallet = encodeBase58(raw);
    const message = new TextEncoder().encode("hello attendance");
    const signature = new Uint8Array(edSign(null, message, privateKey));

    expect(verifyWalletSignature(wallet, message, signature)).toBe(true);
    expect(
      verifyWalletSignature(
        wallet,
        new TextEncoder().encode("tampered"),
        signature,
      ),
    ).toBe(false);
  });

  it("decodeBase58 round-trips and rejects bad chars", () => {
    expect(decodeBase58("11")).toEqual(new Uint8Array([0, 0]));
    expect(() => decodeBase58("0OIl")).toThrow();
  });
});
