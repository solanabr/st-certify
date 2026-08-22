import type { Locale } from "./locales";
import { commonDict, type CommonKey } from "./dict/common";
import { landingDict, type LandingKey } from "./dict/landing";
import { adminDict, type adminKey } from "./dict/admin";
import { designerDict, type designerKey } from "./dict/designer";
import { certificatorDict, type certificatorKey } from "./dict/certificator";
import { studentDict, type studentKey } from "./dict/student";
import { verifyDict, type verifyKey } from "./dict/verify";
import { attendanceDict, type attendanceKey } from "./dict/attendance";
import { emailDict, type emailKey } from "./dict/email";
import { inviteDict, type inviteKey } from "./dict/invite";
import { signDict, type signKey } from "./dict/sign";

/**
 * Flat per-locale maps merged from every domain dictionary. Key collisions
 * across domains are prevented by convention: every key is prefixed with its
 * domain ("admin.", "verify.", …).
 */
export type TranslationKey =
  | CommonKey
  | LandingKey
  | adminKey
  | designerKey
  | certificatorKey
  | studentKey
  | verifyKey
  | attendanceKey
  | emailKey
  | inviteKey
  | signKey;

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  "pt-BR": {
    ...commonDict["pt-BR"],
    ...landingDict["pt-BR"],
    ...adminDict["pt-BR"],
    ...designerDict["pt-BR"],
    ...certificatorDict["pt-BR"],
    ...studentDict["pt-BR"],
    ...verifyDict["pt-BR"],
    ...attendanceDict["pt-BR"],
    ...emailDict["pt-BR"],
    ...inviteDict["pt-BR"],
    ...signDict["pt-BR"],
  },
  en: {
    ...commonDict.en,
    ...landingDict.en,
    ...adminDict.en,
    ...designerDict.en,
    ...certificatorDict.en,
    ...studentDict.en,
    ...verifyDict.en,
    ...attendanceDict.en,
    ...emailDict.en,
    ...inviteDict.en,
    ...signDict.en,
  },
  es: {
    ...commonDict.es,
    ...landingDict.es,
    ...adminDict.es,
    ...designerDict.es,
    ...certificatorDict.es,
    ...studentDict.es,
    ...verifyDict.es,
    ...attendanceDict.es,
    ...emailDict.es,
    ...inviteDict.es,
    ...signDict.es,
  },
};

export type TranslateParams = Record<string, string | number>;

/** `format("{count} pending", { count: 3 })` → `"3 pending"`. */
export function format(template: string, params?: TranslateParams): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: TranslateParams,
): string {
  return format(dictionaries[locale][key], params);
}
