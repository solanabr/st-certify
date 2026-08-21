import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCode } from "../verify-code";

// Crockford base32: the full alphabet, and the charset regex the PDF footer
// and the /verify input field both rely on.
const CROCKFORD_CHARSET = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const AMBIGUOUS = ["I", "L", "O", "U"];

// A realistic certificate PDA and a filler one. Their expected codes were
// derived independently of the implementation (whole-40-bit BigInt shifted per
// 5-bit group, rather than the byte-window the implementation uses), so a
// change to the derivation breaks this test instead of silently re-baselining
// it. These are wire-format constants: printed on issued PDFs and typed into
// /verify by humans, so they must never change once a certificate exists.
const ADDRESS = "5vJRnAiVQKgVJvKZJmTHZ8gWx3nZgWEDbMFkTQ9SF2ZQ";
const ADDRESS_CODE = "C749RPNK";
const OTHER_ADDRESS = "CertPDA1111111111111111111111111111111111111";
const OTHER_CODE = "4T86GMVD";

describe("verifyCode", () => {
  it("derives the pinned code for a known address", () => {
    expect(verifyCode(ADDRESS)).toBe(ADDRESS_CODE);
    expect(verifyCode(OTHER_ADDRESS)).toBe(OTHER_CODE);
  });

  it("is deterministic across calls", () => {
    expect(verifyCode(ADDRESS)).toBe(verifyCode(ADDRESS));
  });

  it("returns 8 characters from the Crockford alphabet", () => {
    for (const addr of [ADDRESS, OTHER_ADDRESS, "a", ""]) {
      const code = verifyCode(addr);
      expect(code).toHaveLength(8);
      expect(code).toMatch(CROCKFORD_CHARSET);
    }
  });

  it("never emits the ambiguous letters Crockford excludes", () => {
    // 500 addresses is ~4000 characters — enough that any I/L/O/U in the
    // alphabet string would show up.
    const codes = Array.from({ length: 500 }, (_, i) =>
      verifyCode(`addr-${i}`),
    );
    for (const letter of AMBIGUOUS) {
      expect(codes.join("")).not.toContain(letter);
    }
  });

  it("encodes exactly the first 5 bytes of sha256(address)", () => {
    // The 40 bits the code carries, decoded back out of it, must equal the
    // digest prefix — this is what makes the code a fingerprint of the
    // address rather than an arbitrary label.
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const decoded = [...verifyCode(ADDRESS)].reduce(
      (acc, ch) => acc * 32n + BigInt(alphabet.indexOf(ch)),
      0n,
    );
    const digest = createHash("sha256").update(ADDRESS, "utf8").digest();
    const expected = digest
      .subarray(0, 5)
      .reduce((acc, byte) => acc * 256n + BigInt(byte), 0n);

    expect(decoded).toBe(expected);
  });

  it("distinguishes addresses that differ in one character", () => {
    expect(verifyCode(ADDRESS)).not.toBe(
      verifyCode(`${ADDRESS.slice(0, -1)}R`),
    );
  });
});
