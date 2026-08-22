import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildCertificatePdf,
  certificateRenderScale,
  type CertificatePdfInput,
} from "../build";

// 1×1 RGB PNG — the builder only needs real PNG bytes and an aspect ratio.
const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const SHA = "a".repeat(63) + "9";

// The accents + em dash are the point: the Info dict is where a naive
// single-byte encoding truncates U+2014 to 0x14.
const ACCENTED_EDITION = "Certificação — João";

function input(overrides: Partial<CertificatePdfInput> = {}) {
  return {
    png: PNG,
    artifactSha256Hex: SHA,
    verifyUrl: "https://certify.test/verify/CeRt1F1cAtEaDdReSs",
    verifyCode: "K7M2QX9T",
    txSig: "5" + "z".repeat(63),
    assetId: "As" + "s".repeat(30),
    cluster: "devnet",
    issuedAtIso: "2026-08-20T14:05:00.000Z",
    issuer: {
      name: "Superteam Brasil",
      contactUrl: "https://superteam.fun/br",
      cnpj: "00.000.000/0001-00",
    },
    holder: { name: "João Antônio de Assunção" },
    editionName: ACCENTED_EDITION,
    signers: [
      {
        name: "Ana Ribeiro",
        role: "Coordenadora",
        wallet: "Wa" + "l".repeat(30),
        signedAtIso: "2026-08-19T10:00:00.000Z",
        txSig: "3" + "y".repeat(63),
      },
      {
        name: "Bruno Sá",
        role: "Instrutor",
        wallet: "Wb" + "l".repeat(30),
        signedAtIso: null,
        txSig: null,
      },
    ],
    locale: "pt-BR",
    ...overrides,
  } satisfies CertificatePdfInput;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function ascii(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

/** The `/Title <FEFF…>` value, decoded back out of the raw file bytes. */
function readTitle(bytes: Uint8Array): { hex: string; text: string } {
  const match = ascii(bytes).match(/\/Title <([0-9A-Fa-f]+)>/);
  if (!match) throw new Error("no /Title hex string in the PDF");
  const raw = Buffer.from(match[1], "hex");
  // PDFHexString.fromText writes a UTF-16BE BOM + code units; Node reads LE.
  return {
    hex: match[1].toUpperCase(),
    text: raw.swap16().toString("utf16le").slice(1),
  };
}

describe("buildCertificatePdf", () => {
  it("produces byte-identical output for identical input", async () => {
    const a = await buildCertificatePdf(input());
    const b = await buildCertificatePdf(input());

    expect(sha256(a)).toBe(sha256(b));
    expect(a.length).toBe(b.length);
  });

  it("emits a PDF whose footer carries the validation code", async () => {
    const pdf = await buildCertificatePdf(input());

    expect(ascii(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(ascii(pdf)).toContain("K7M2QX9T");
  });

  it("keeps accented text and em dashes intact in the Info dictionary", async () => {
    const pdf = await buildCertificatePdf(input());
    const title = readTitle(pdf);

    expect(title.text).toBe(`João Antônio de Assunção — ${ACCENTED_EDITION}`);
    // The em dash survives as a UTF-16BE code unit, not as a lone 0x14 byte.
    expect(title.hex).toContain("2014");
    expect(title.hex).not.toMatch(/00E7 ?00 ?14/);
  });

  it("exposes the artifact hash to the raw-bytes XMP regex the dropzone uses", async () => {
    const pdf = await buildCertificatePdf(input());

    const found = ascii(pdf).match(/certify:artifactSha256="([0-9a-f]{64})"/);
    expect(found?.[1]).toBe(SHA);
  });

  it("pins every date so two runs cannot disagree about the clock", async () => {
    const text = ascii(await buildCertificatePdf(input()));

    expect(text).toContain("/CreationDate (D:19700101000000Z)");
    expect(text).toContain("/ModDate (D:19700101000000Z)");
    expect(text).toContain("/Producer");
    expect(text).toContain(`<${SHA.toUpperCase()}>`);
  });

  it("differs when the certificate differs", async () => {
    const a = await buildCertificatePdf(input());
    const b = await buildCertificatePdf(input({ verifyCode: "ZZZZ1111" }));

    expect(sha256(a)).not.toBe(sha256(b));
  });

  it("renders each locale's audit trail", async () => {
    for (const locale of ["pt-BR", "en", "es"] as const) {
      const pdf = await buildCertificatePdf(input({ locale }));
      expect(ascii(pdf.subarray(0, 5))).toBe("%PDF-");
    }
  });
});

describe("certificateRenderScale", () => {
  it("asks for enough pixels to hit 300 dpi in the page's image box", async () => {
    const scale = certificateRenderScale({ width: 2000, height: 1414 });

    // A 2000px-wide canvas is well under 300 dpi at print size.
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThan(4);
    // Same box, half the source pixels ⇒ twice the multiplier.
    expect(certificateRenderScale({ width: 1000, height: 707 })).toBeCloseTo(
      scale * 2,
      5,
    );
  });
});
