import "server-only";

import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
} from "./locales";
import {
  translate,
  type TranslateParams,
  type TranslationKey,
} from "./dictionaries";

/** Active locale for server components (reads the same cookie as useT). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Server-side counterpart of useT for server components and metadata. */
export async function getT(): Promise<{
  locale: Locale;
  t: (key: TranslationKey, params?: TranslateParams) => string;
}> {
  const locale = await getLocale();
  return {
    locale,
    t: (key, params) => translate(locale, key, params),
  };
}
