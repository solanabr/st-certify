import { describe, expect, it } from "vitest";
import { inviteDict } from "@/lib/i18n/dict/invite";
import { signDict } from "@/lib/i18n/dict/sign";
import { LOCALES } from "@/lib/i18n/locales";

/**
 * The consent panel itself can't be asserted through `renderToStaticMarkup` —
 * Radix portals its content only after mount, so an open dialog server-renders
 * to an empty string. What the panel promises is therefore pinned here, at the
 * copy: the gate logic lives in ceremony.test.ts, and the disclosure's contents
 * live in this dictionary.
 */
const REQUIRED_CLAUSES = [
  "sign.consent.attestTitle",
  "sign.consent.attestBody",
  "sign.consent.recordTitle",
  "sign.consent.recordBody",
  "sign.consent.finalTitle",
  "sign.consent.finalBody",
  "sign.consent.walletTitle",
  "sign.consent.walletBody",
  "sign.consent.agree",
] as const;

/**
 * Claims this product must never make about its signatures. They are regulated
 * terms in Brazil and none of them describe what a wallet signature on Solana
 * actually is — a sincere but wrong edit to the disclosure is exactly the kind
 * of change that would otherwise ship unnoticed.
 */
const FORBIDDEN_CLAIMS = [
  "qualificada",
  "qualificado",
  "icp-brasil",
  "icp brasil",
  "mec",
];

describe("consent disclosure copy", () => {
  it.each(LOCALES)("states every clause in %s", (locale) => {
    const missing = REQUIRED_CLAUSES.filter(
      (key) => (signDict[locale][key] ?? "").trim() === "",
    );

    expect(missing).toEqual([]);
  });

  it.each(LOCALES)(
    "names the permanence and the irreversibility in %s",
    (locale) => {
      const disclosure = [
        signDict[locale]["sign.consent.recordBody"],
        signDict[locale]["sign.consent.finalBody"],
      ]
        .join(" ")
        .toLowerCase();

      expect(disclosure).toContain("blockchain");
      // "cannot be erased" / "cannot be removed", however each locale says it.
      expect(disclosure).toMatch(/não pode|no se puede|cannot/);
    },
  );

  it.each(LOCALES)("claims no regulated signature regime in %s", (locale) => {
    const surface = [
      ...Object.values(signDict[locale]),
      ...Object.values(inviteDict[locale]),
    ]
      .join(" ")
      .toLowerCase();

    const claimed = FORBIDDEN_CLAIMS.filter((claim) =>
      new RegExp(`\\b${claim}\\b`).test(surface),
    );

    expect(claimed).toEqual([]);
  });
});
