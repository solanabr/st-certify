import type { PDFFont } from "pdf-lib";

// CP1252's non-Latin-1 slots — the typographic characters pt-BR copy actually
// uses (em dash, curly quotes, ellipsis). Everything else above U+00FF has no
// WinAnsi slot, and pdf-lib's standard fonts encode nothing else.
const CP1252_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

// Intl formatters emit narrow/no-break spaces that WinAnsi has no slot for;
// they are spaces to every reader, so they become spaces here.
const SPACE_LIKE = /[    ]/g;

/**
 * Coerces a string into what pdf-lib's standard (non-embedded) fonts can
 * actually encode. Unmappable characters become "?" instead of throwing —
 * a certificate with a transliterated name still prints; one that throws at
 * render time is a 500 on the download button.
 */
export function winAnsi(text: string): string {
  let out = "";
  for (const char of text.normalize("NFC").replace(SPACE_LIKE, " ")) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp === 0x0a || cp === 0x0d) {
      out += " ";
    } else if ((cp >= 0x20 && cp < 0x7f) || (cp >= 0xa0 && cp < 0x100)) {
      out += char;
    } else if (CP1252_EXTRAS.has(char)) {
      out += char;
    } else if (cp >= 0x100) {
      out += "?";
    }
  }
  return out;
}

const TYPOGRAPHIC_ASCII: Record<string, string> = {
  "—": "-",
  "–": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "•": "*",
};

/**
 * Folds a string down to printable ASCII. The signature dictionary's strings
 * (`/Reason`, `/Name`, `/Location`) are written by @signpdf through
 * `PDFString.of`, which emits one byte per character — so a character above
 * U+00FF is silently truncated to its low byte and an em dash turns into 0x14.
 * Anything that goes into that dictionary comes through here first.
 */
export function asciiFold(text: string): string {
  let folded = winAnsi(text);
  for (const [from, to] of Object.entries(TYPOGRAPHIC_ASCII)) {
    folded = folded.split(from).join(to);
  }
  return folded
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

/** Sanitized text clipped to `maxWidth`, with an ellipsis when it had to give. */
export function ellipsize(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  const safe = winAnsi(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;

  let low = 0;
  let high = safe.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (font.widthOfTextAtSize(`${safe.slice(0, mid)}…`, size) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${safe.slice(0, low)}…`;
}
