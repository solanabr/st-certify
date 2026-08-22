import { afterEach, describe, expect, it } from "vitest";
import { pdfCachePath } from "../storage";

const SHA = "a".repeat(64);

/** Any base64 works: the fingerprint hashes the decoded bytes, it never parses them. */
function useKey(name: string): void {
  process.env.SEAL_P12_BASE64 = Buffer.from(name).toString("base64");
}

afterEach(() => {
  delete process.env.SEAL_P12_BASE64;
});

describe("pdfCachePath", () => {
  it("addresses an unsealed export by artifact and locale alone", () => {
    expect(pdfCachePath(SHA, "pt-BR", false)).toBe(
      `certs-pdf/${SHA}-pt-BR.pdf`,
    );
  });

  it("separates a sealed export from the unsealed one", () => {
    useKey("key-a");

    expect(pdfCachePath(SHA, "pt-BR", true)).not.toBe(
      pdfCachePath(SHA, "pt-BR", false),
    );
    expect(pdfCachePath(SHA, "pt-BR", true)).toMatch(
      new RegExp(`^certs-pdf/${SHA}-pt-BR-sealed-[0-9a-f]{12}\\.pdf$`),
    );
  });

  it("moves to a new path when the signing key is rotated", () => {
    useKey("key-a");
    const before = pdfCachePath(SHA, "pt-BR", true);
    useKey("key-b");
    const after = pdfCachePath(SHA, "pt-BR", true);

    // The whole point: the old key's signature can no longer answer a request.
    expect(after).not.toBe(before);
    useKey("key-a");
    expect(pdfCachePath(SHA, "pt-BR", true)).toBe(before);
  });

  it("keeps locales apart", () => {
    useKey("key-a");

    expect(pdfCachePath(SHA, "en", true)).not.toBe(
      pdfCachePath(SHA, "pt-BR", true),
    );
  });
});
