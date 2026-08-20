import { describe, it, expect } from "vitest";
import { formatDate } from "../format";

const ISO = "2026-03-09T14:05:00.000Z";

describe("formatDate", () => {
  it("renders the same instant differently per locale", () => {
    const pt = formatDate(ISO, "pt-BR");
    const en = formatDate(ISO, "en");
    const es = formatDate(ISO, "es");

    expect(pt).not.toBe(en);
    // Month name is the tell: pt "mar.", en "Mar", es "mar".
    expect(pt).toMatch(/mar/i);
    expect(en).toMatch(/mar/i);
    expect(es).toMatch(/mar/i);
    expect(pt).toContain("2026");
    expect(en).toContain("2026");
    expect(es).toContain("2026");
  });

  it("orders day and month per locale conventions", () => {
    // pt-BR/es put the day first; en-US puts the month first.
    expect(formatDate(ISO, "pt-BR", "dateTime").indexOf("9")).toBeLessThan(
      formatDate(ISO, "pt-BR", "dateTime").indexOf("3"),
    );
    expect(formatDate(ISO, "en", "dateTime").indexOf("3")).toBeLessThan(
      formatDate(ISO, "en", "dateTime").indexOf("9"),
    );
  });

  it("includes a time for the time-bearing styles only", () => {
    expect(formatDate(ISO, "en", "date")).not.toMatch(/\d:\d/);
    expect(formatDate(ISO, "en", "dateTime")).toMatch(/\d:\d/);
    expect(formatDate(ISO, "en", "dayTime")).toMatch(/\d:\d/);
    expect(formatDate(ISO, "en", "full")).toMatch(/\d:\d/);
  });

  it("returns an em dash instead of 'Invalid Date' for unparseable input", () => {
    expect(formatDate("not-a-date", "pt-BR")).toBe("—");
    expect(formatDate("", "en")).toBe("—");
  });

  it("is stable across repeated calls (formatter cache)", () => {
    expect(formatDate(ISO, "pt-BR", "dayTime")).toBe(
      formatDate(ISO, "pt-BR", "dayTime"),
    );
  });
});
