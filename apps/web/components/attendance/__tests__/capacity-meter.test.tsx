import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapacityMeter } from "../capacity-meter";

/**
 * The regression these guard: `toLocaleString()` with no argument formats
 * against the *runtime's* default locale — the server's during SSR, the
 * browser's during hydration. A pt-BR reader on an en-US server was served
 * "1,234,567" and re-rendered "1.234.567", and React discarded the mismatch.
 *
 * Every expectation below is written against a locale that is NOT the test
 * runtime's default (en-US), so any regression back to an implicit locale
 * flips the grouping separator and fails here.
 */
describe("CapacityMeter", () => {
  it("formats counts from the locale prop, not the runtime default", () => {
    const pt = renderToStaticMarkup(
      <CapacityMeter value={1234567} max={10000000} locale="pt-BR" />,
    );
    const en = renderToStaticMarkup(
      <CapacityMeter value={1234567} max={10000000} locale="en" />,
    );

    expect(pt).toContain("1.234.567 / 10.000.000");
    expect(en).toContain("1,234,567 / 10,000,000");
    expect(pt).not.toBe(en);
  });

  it("honours locale-specific grouping rules", () => {
    // es leaves four-digit numbers ungrouped ("2500"), pt-BR groups them
    // ("2.500") — the separator is resolved by ICU, never string surgery.
    const es = renderToStaticMarkup(
      <CapacityMeter value={2500} max={50000} locale="es" />,
    );
    const pt = renderToStaticMarkup(
      <CapacityMeter value={2500} max={50000} locale="pt-BR" />,
    );

    expect(es).toContain("2500 / 50.000");
    expect(pt).toContain("2.500 / 50.000");
  });

  it("announces the formatted counts when no label is supplied", () => {
    const html = renderToStaticMarkup(
      <CapacityMeter value={4200} max={100000} locale="pt-BR" />,
    );

    expect(html).toContain('aria-label="4.200 / 100.000"');
  });

  it("keeps the caller's label as the accessible name", () => {
    const html = renderToStaticMarkup(
      <CapacityMeter
        value={10}
        max={100}
        label="Uso da árvore"
        locale="pt-BR"
      />,
    );

    expect(html).toContain('aria-label="Uso da árvore"');
    expect(html).toContain("10 / 100");
  });
});
