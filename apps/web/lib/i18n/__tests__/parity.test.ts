import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dictionaries } from "../dictionaries";
import { LOCALES, type Locale } from "../locales";
import { adminDict } from "../dict/admin";
import { attendanceDict } from "../dict/attendance";
import { certificatorDict } from "../dict/certificator";
import { commonDict } from "../dict/common";
import { designerDict } from "../dict/designer";
import { emailDict } from "../dict/email";
import { inviteDict } from "../dict/invite";
import { landingDict } from "../dict/landing";
import { signDict } from "../dict/sign";
import { studentDict } from "../dict/student";
import { verifyDict } from "../dict/verify";

type DomainDict = Record<Locale, Record<string, string>>;

/**
 * Keyed by filename (minus `.ts`) so the disk-coverage check below can compare
 * this map against `dict/` directly — a new domain file that nobody wired up
 * fails here instead of shipping as a silently untranslated surface.
 */
const DOMAINS: Record<string, DomainDict> = {
  admin: adminDict,
  attendance: attendanceDict,
  certificator: certificatorDict,
  common: commonDict,
  designer: designerDict,
  email: emailDict,
  invite: inviteDict,
  landing: landingDict,
  sign: signDict,
  student: studentDict,
  verify: verifyDict,
};

const SOURCE_LOCALE: Locale = "pt-BR";
const TARGET_LOCALES = LOCALES.filter((l) => l !== SOURCE_LOCALE);

/** Same `{name}` syntax `format()` interpolates. */
function placeholders(value: string): string[] {
  return Array.from(value.matchAll(/\{(\w+)\}/g), (m) => m[1]).sort();
}

describe("dictionary parity", () => {
  it("covers every dictionary file in dict/", () => {
    const onDisk = readdirSync(path.join(import.meta.dirname, "..", "dict"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();

    expect(onDisk).toEqual(Object.keys(DOMAINS).sort());
  });

  describe.each(Object.entries(DOMAINS))("%s", (_domain, dict) => {
    const sourceKeys = Object.keys(dict[SOURCE_LOCALE]).sort();

    it.each(TARGET_LOCALES)("has exactly pt-BR's keys in %s", (locale) => {
      expect(Object.keys(dict[locale]).sort()).toEqual(sourceKeys);
    });

    it.each(LOCALES)("has no blank value in %s", (locale) => {
      const blank = Object.entries(dict[locale])
        .filter(([, value]) => value.trim() === "")
        .map(([key]) => key);

      expect(blank).toEqual([]);
    });

    it.each(TARGET_LOCALES)(
      "keeps pt-BR's interpolation placeholders in %s",
      (locale) => {
        const drifted = sourceKeys.filter(
          (key) =>
            placeholders(dict[locale][key]).join(",") !==
            placeholders(dict[SOURCE_LOCALE][key]).join(","),
        );

        expect(drifted).toEqual([]);
      },
    );

    it("is registered in the merged dictionary for every locale", () => {
      for (const locale of LOCALES) {
        const merged: Record<string, string> = dictionaries[locale];
        const missing = sourceKeys.filter((key) => !(key in merged));

        expect(missing).toEqual([]);
      }
    });
  });

  it("never lets two domains define the same key", () => {
    const owners = new Map<string, string>();
    const collisions: string[] = [];

    for (const [domain, dict] of Object.entries(DOMAINS)) {
      for (const key of Object.keys(dict[SOURCE_LOCALE])) {
        const previous = owners.get(key);
        if (previous) {
          collisions.push(`${key} (${previous} + ${domain})`);
        }
        owners.set(key, domain);
      }
    }

    expect(collisions).toEqual([]);
  });
});
