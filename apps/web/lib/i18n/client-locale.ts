import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";
import {
  translate,
  type TranslateParams,
  type TranslationKey,
} from "./dictionaries";

/**
 * The active locale for client modules that aren't React components and so
 * can't call `useT()` — the fetch wrapper and the toast error handler.
 * `<html lang>` is server-rendered from the locale cookie and kept in sync by
 * `LocaleProvider.setLocale`, making it the one locale source readable from
 * outside the hook.
 */
export function activeLocale(): Locale {
  if (typeof document === "undefined") {
    return DEFAULT_LOCALE;
  }
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

/** `t()` for those same non-component modules. Prefer `useT()` anywhere a hook is legal. */
export function tc(key: TranslationKey, params?: TranslateParams): string {
  return translate(activeLocale(), key, params);
}
