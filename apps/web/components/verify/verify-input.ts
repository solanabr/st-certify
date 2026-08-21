// Pure input parsing for the verify tool, kept out of the .tsx so it is
// unit-testable (vitest runs these in a node env with no JSX transform).
// Complements lib/chain/verify.ts's `classifyVerifyInput`, which handles the
// address/hash/URL forms; these two are the paper and PDF forms.

/** Crockford base32 minus the four ambiguous letters — see lib/verify-code.ts. */
const CROCKFORD_CODE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

/**
 * Normalizes a hand-typed validation code, or null if it cannot be one.
 *
 * Crockford's alphabet exists so a printed code survives transcription, and
 * this is the half of that promise the reader is owed: I and L are read as 1,
 * O as 0, separators and case are ignored. It cannot turn a real miss into a
 * false hit — the substituted letters are not in the alphabet, so no valid code
 * contains them.
 */
export function normalizeValidationCode(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[\s.\-_]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");

  return CROCKFORD_CODE.test(cleaned) ? cleaned : null;
}

/** True for bytes that begin with the PDF magic number. */
export function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

const XMP_HASH = /certify:artifactSha256="([0-9a-f]{64})"/;
const INFO_HASH = /\/CertifyArtifactSha256\s*<([0-9A-Fa-f]+)>/;

/** Decodes a pdf-lib hex string (UTF-16BE, BOM-prefixed) back to text. */
function fromHexString(hex: string): string {
  const units = hex.match(/.{4}/g) ?? [];
  return units
    .map((unit) => String.fromCharCode(parseInt(unit, 16)))
    .join("")
    .replace(/^﻿/, "");
}

/**
 * The certificate hash carried by one of our exported PDFs.
 *
 * Read with a regex over the raw bytes rather than a PDF parser: the builder
 * writes the XMP packet uncompressed precisely so this works in a browser with
 * no dependency. Falls back to the custom Info entry, whose UTF-16BE hex is
 * decoded back to ASCII. A PDF from anywhere else yields null, and the caller
 * falls through to hashing the file like any other upload.
 */
export function artifactShaFromPdf(bytes: Uint8Array): string | null {
  let text = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  const xmp = text.match(XMP_HASH);
  if (xmp) return xmp[1];

  const info = text.match(INFO_HASH);
  if (!info) return null;

  const decoded = fromHexString(info[1]);
  return /^[0-9a-f]{64}$/.test(decoded) ? decoded : null;
}
