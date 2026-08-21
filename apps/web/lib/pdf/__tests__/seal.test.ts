import { createHash } from "node:crypto";
import forge from "node-forge";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildCertificatePdf, type CertificatePdfInput } from "../build";
import {
  envP12Source,
  sealConfigured,
  sealPdf,
  type CertificateSource,
} from "../seal";

const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const PASSPHRASE = "throwaway";
const SIGNING_TIME = new Date("2026-08-20T14:05:00.000Z");

const INPUT: CertificatePdfInput = {
  png: PNG,
  artifactSha256Hex: "b".repeat(64),
  verifyUrl: "https://certify.test/verify/CeRt1F1cAtE",
  verifyCode: "K7M2QX9T",
  txSig: "5" + "z".repeat(63),
  assetId: "As" + "s".repeat(30),
  cluster: "devnet",
  issuedAtIso: SIGNING_TIME.toISOString(),
  issuer: { name: "Superteam Brasil" },
  holder: { name: "João Antônio de Assunção" },
  editionName: "Certificação — João",
  signers: [],
  locale: "pt-BR",
};

/** A self-signed certificate that exists only inside this test run. */
function throwawayP12(): Buffer {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2026-01-01T00:00:00Z");
  cert.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const attrs = [{ name: "commonName", value: "st-certify test seal" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASSPHRASE, {
    algorithm: "3des",
  });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
}

let p12: Buffer;
let unsealed: Uint8Array;

beforeAll(async () => {
  p12 = throwawayP12();
  unsealed = await buildCertificatePdf(INPUT);
}, 60_000);

afterEach(() => {
  delete process.env.SEAL_P12_BASE64;
  delete process.env.SEAL_P12_PASSPHRASE;
});

function configure(): void {
  process.env.SEAL_P12_BASE64 = p12.toString("base64");
  process.env.SEAL_P12_PASSPHRASE = PASSPHRASE;
}

function seal(source: CertificateSource): Promise<Uint8Array> {
  return sealPdf(unsealed, source, {
    reason: "https://explorer.solana.com/tx/5zzz?cluster=devnet",
    signingTime: SIGNING_TIME,
    name: "Superteam Brasil",
  });
}

describe("sealConfigured", () => {
  it("is false without a certificate, so the export ships unsealed", () => {
    expect(sealConfigured()).toBe(false);
    expect(() => envP12Source()).toThrow();
  });

  it("is true once the p12 is in the environment", () => {
    configure();
    expect(sealConfigured()).toBe(true);
  });
});

describe("sealPdf", () => {
  it("produces a signed PDF with a real ByteRange and signature widget", async () => {
    configure();
    const sealed = await seal(envP12Source());
    const text = Buffer.from(sealed).toString("latin1");

    expect(text.slice(0, 5)).toBe("%PDF-");
    expect(text).toMatch(/\/ByteRange \[0 \d+ \d+ \d+\]/);
    expect(text).toContain("/SubFilter /ETSI.CAdES.detached");
    expect(text).toContain("/Subtype /Widget");
    expect(text).toContain("/FT /Sig");
    // The signature is bigger than nothing and smaller than the placeholder.
    const contents = text.match(/\/Contents <([0-9A-Fa-f]+)>/);
    expect(contents).not.toBeNull();
    expect(contents?.[1].replace(/0+$/, "").length).toBeGreaterThan(1000);
  }, 30_000);

  it("signs a CMS SignedData over everything outside the signature window", async () => {
    configure();
    const sealed = Buffer.from(await seal(envP12Source()));
    const text = sealed.toString("latin1");

    const range = text.match(/\/ByteRange \[(\d+) (\d+) (\d+) (\d+)\]/);
    const [start, firstLen, secondStart, secondLen] = (range ?? [])
      .slice(1)
      .map(Number);
    // The two covered spans are the whole file minus the /Contents hex window,
    // which is what a reader re-digests when it checks the signature.
    expect(start).toBe(0);
    expect(firstLen + secondLen).toBe(sealed.length - (secondStart - firstLen));

    const der = text
      .slice(text.indexOf("<", firstLen) + 1, text.indexOf(">", firstLen))
      .replace(/0+$/, "");
    const cms = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(
        forge.util.createBuffer(Buffer.from(der, "hex").toString("binary")),
      ),
    ) as unknown as { type: string; rawCapture: { signature: string } };

    expect(cms.type).toBe(forge.pki.oids.signedData);
    expect(cms.rawCapture.signature.length).toBe(256); // RSA-2048
  }, 30_000);

  it("keeps the builder's pinned dates instead of stamping the load time", async () => {
    configure();
    const text = Buffer.from(await seal(envP12Source())).toString("latin1");

    expect(text).toContain("/ModDate (D:19700101000000Z)");
    expect(text).toContain("/CreationDate (D:19700101000000Z)");
  }, 30_000);

  it("is deterministic for a pinned signing time and a fixed key", async () => {
    configure();
    const a = await seal(envP12Source());
    const b = await seal(envP12Source());

    expect(createHash("sha256").update(a).digest("hex")).toBe(
      createHash("sha256").update(b).digest("hex"),
    );
  }, 30_000);

  it("accepts any CertificateSource, not just @signpdf's own signers", async () => {
    configure();
    const inner = envP12Source();
    const calls: Array<Date | undefined> = [];
    const adapted: CertificateSource = {
      sign: (pdf, signingTime) => {
        calls.push(signingTime);
        return inner.sign(pdf, signingTime);
      },
    };

    const sealed = await seal(adapted);

    expect(calls).toEqual([SIGNING_TIME]);
    expect(Buffer.from(sealed).toString("latin1")).toMatch(/\/ByteRange \[0 /);
  }, 30_000);

  it("leaves the document unchanged when nothing seals it", () => {
    // The route's skip path: no source is built, so the builder's bytes ship.
    expect(sealConfigured()).toBe(false);
    expect(unsealed.length).toBeGreaterThan(0);
  });
});
