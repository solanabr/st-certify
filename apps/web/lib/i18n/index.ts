// Client-safe surface. Server components use "@/lib/i18n/server" instead
// (kept out of this barrel so importing it from client code fails the build
// via server-only, instead of silently breaking).
export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  LOCALE_SHORT,
  isLocale,
  setLocaleCookie,
  type Locale,
} from "./locales";
export {
  dictionaries,
  translate,
  type TranslationKey,
  type TranslateParams,
} from "./dictionaries";
export { LocaleProvider, useT } from "./provider";
