import { describe, expect, it } from "vitest";
import { buildCertificatePdf } from "@/lib/pdf/build";
import {
  artifactShaFromPdf,
  isPdfBytes,
  normalizeValidationCode,
} from "../verify-input";

const SHA = "3f".repeat(32);

describe("normalizeValidationCode", () => {
  it("accepts a code exactly as printed", () => {
    expect(normalizeValidationCode("K7M2QX9T")).toBe("K7M2QX9T");
  });

  it("forgives the transcription mistakes Crockford's alphabet anticipates", () => {
    // I/L are read as 1 and O as 0 — none of them are in the alphabet, so this
    // can rescue a typo but can never invent a match.
    expect(normalizeValidationCode("k7m2qx9t")).toBe("K7M2QX9T");
    expect(normalizeValidationCode(" k7m2-qx9t ")).toBe("K7M2QX9T");
    expect(normalizeValidationCode("IL0O1234")).toBe("11001234");
  });

  it("rejects anything that is not a code", () => {
    expect(normalizeValidationCode("")).toBeNull();
    expect(normalizeValidationCode("K7M2QX9")).toBeNull();
    expect(normalizeValidationCode("K7M2QX9TX")).toBeNull();
    expect(normalizeValidationCode("K7M2QX9!")).toBeNull();
    // A base58 address must not be swallowed by the code path.
    expect(
      normalizeValidationCode("CeRt1F1cAtEaDdReSs11111111111111"),
    ).toBeNull();
  });
});

describe("isPdfBytes", () => {
  it("recognizes the PDF magic number and nothing else", () => {
    expect(isPdfBytes(new TextEncoder().encode("%PDF-1.7\n..."))).toBe(true);
    expect(isPdfBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(
      false,
    );
    expect(isPdfBytes(new Uint8Array([0x25]))).toBe(false);
  });
});

describe("artifactShaFromPdf", () => {
  it("reads the hash out of an exported certificate without a PDF parser", async () => {
    const pdf = await buildCertificatePdf({
      png: new Uint8Array(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        ),
      ),
      artifactSha256Hex: SHA,
      verifyUrl: "https://certify.test/verify/Cert111",
      verifyCode: "K7M2QX9T",
      txSig: null,
      assetId: null,
      cluster: "devnet",
      issuedAtIso: "2026-08-20T14:05:00.000Z",
      issuer: { name: "Superteam Brasil" },
      holder: { name: "João Antônio" },
      editionName: "Certificação — João",
      signers: [],
      locale: "pt-BR",
    });

    expect(isPdfBytes(pdf)).toBe(true);
    expect(artifactShaFromPdf(pdf)).toBe(SHA);
  });

  it("falls back to the Info entry when a re-save drops the XMP packet", () => {
    // What a PDF editor that rewrites metadata but keeps /Info looks like.
    const utf16 = [...SHA]
      .map((c) => `00${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("");
    const bytes = new TextEncoder().encode(
      `%PDF-1.7\n/CertifyArtifactSha256 <FEFF${utf16.toUpperCase()}>\n`,
    );

    expect(artifactShaFromPdf(bytes)).toBe(SHA);
  });

  it("returns null for a PDF we did not produce", () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nsome other document\n");
    expect(artifactShaFromPdf(bytes)).toBeNull();
  });
});
