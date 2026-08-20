/**
 * Tiny CSV helpers for the attendee export (P1-4). `toCsv` is pure and
 * unit-tested; `downloadCsv` is the browser-only side effect (Blob + anchor),
 * kept separate so serialization stays testable under the node vitest env.
 */

const UTF8_BOM = "﻿";

/**
 * RFC 4180 field escaping: when a value contains a comma, double quote, CR, or
 * LF, wrap it in double quotes and double any embedded quote. Other values pass
 * through untouched.
 */
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serializes a header row plus string rows to CSV text with CRLF line endings (RFC 4180). */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map((cols) => cols.map(csvEscape).join(","))
    .join("\r\n");
}

/** Triggers a client-side download of `csv` as `filename`. No-op outside the browser. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  // Leading BOM so spreadsheet apps read the UTF-8 accents in event/wallet text.
  const blob = new Blob([UTF8_BOM, csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
