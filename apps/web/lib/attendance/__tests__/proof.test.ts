import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSiwsMessage } from "../siws";
import { resolveProvedWallet } from "../proof";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(bytes: Uint8Array): string {
  let n = 0n;
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

function makeSigner() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = new Uint8Array(
    publicKey.export({ format: "der", type: "spki" }).subarray(-32),
  );
  return {
    wallet: encodeBase58(raw),
    sign: (msg: string) =>
      Buffer.from(
        edSign(null, new TextEncoder().encode(msg), privateKey),
      ).toString("base64"),
  };
}

const DEPS = (
  over: Partial<Parameters<typeof resolveProvedWallet>[2]> = {},
) => ({
  consumeNonce: async () => true,
  getSessionWallets: async () => [],
  expectedDomain: "unit.test",
  ...over,
});

describe("resolveProvedWallet", () => {
  it("accepts a valid signed message", async () => {
    const s = makeSigner();
    const message = buildSiwsMessage({
      domain: "unit.test",
      wallet: s.wallet,
      purpose: "attendance-claim",
      nonce: "n1",
      issuedAt: new Date().toISOString(),
    });
    await expect(
      resolveProvedWallet(
        { wallet: s.wallet, message, signatureBase64: s.sign(message) },
        "attendance-claim",
        DEPS(),
      ),
    ).resolves.toBe(s.wallet);
  });

  it("rejects wrong purpose, wrong domain, spent nonce, bad signature", async () => {
    const s = makeSigner();
    const mk = (
      purpose: "attendance-claim" | "attendance-creator",
      domain = "unit.test",
    ) =>
      buildSiwsMessage({
        domain,
        wallet: s.wallet,
        purpose,
        nonce: "n1",
        issuedAt: new Date().toISOString(),
      });

    const claimMsg = mk("attendance-claim");
    await expect(
      resolveProvedWallet(
        {
          wallet: s.wallet,
          message: mk("attendance-creator"),
          signatureBase64: s.sign(mk("attendance-creator")),
        },
        "attendance-claim",
        DEPS(),
      ),
    ).rejects.toMatchObject({ code: "SIWS_INVALID_SIGNATURE" });
    await expect(
      resolveProvedWallet(
        {
          wallet: s.wallet,
          message: mk("attendance-claim", "evil.test"),
          signatureBase64: s.sign(mk("attendance-claim", "evil.test")),
        },
        "attendance-claim",
        DEPS(),
      ),
    ).rejects.toMatchObject({ code: "SIWS_INVALID_SIGNATURE" });
    await expect(
      resolveProvedWallet(
        {
          wallet: s.wallet,
          message: claimMsg,
          signatureBase64: s.sign(claimMsg),
        },
        "attendance-claim",
        DEPS({ consumeNonce: async () => false }),
      ),
    ).rejects.toMatchObject({ code: "SIWS_NONCE_EXPIRED" });
    await expect(
      resolveProvedWallet(
        {
          wallet: s.wallet,
          message: claimMsg,
          signatureBase64: Buffer.alloc(64).toString("base64"),
        },
        "attendance-claim",
        DEPS(),
      ),
    ).rejects.toMatchObject({ code: "SIWS_INVALID_SIGNATURE" });
    await expect(
      resolveProvedWallet(
        {
          wallet: s.wallet,
          message: claimMsg,
          signatureBase64: "!!!not-base64!!!",
        },
        "attendance-claim",
        DEPS(),
      ),
    ).rejects.toMatchObject({ code: "SIWS_INVALID_SIGNATURE" });
  });

  it("falls back to the Privy session when no signature is sent", async () => {
    const s = makeSigner();
    await expect(
      resolveProvedWallet(
        { wallet: s.wallet },
        "attendance-claim",
        DEPS({ getSessionWallets: async () => [s.wallet] }),
      ),
    ).resolves.toBe(s.wallet);
    await expect(
      resolveProvedWallet({ wallet: s.wallet }, "attendance-claim", DEPS()),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
