export type Locale = "pt-BR" | "en" | "es";

export const LOCALES = [
  "pt-BR",
  "en",
  "es",
] as const satisfies readonly Locale[];

export const DEFAULT_LOCALE: Locale = "pt-BR";

export const LOCALE_COOKIE = "certify_locale";

/** Native-language labels for the switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
  "pt-BR": "Português",
  en: "English",
  es: "Español",
};

/** Short labels for compact UI (trigger button). */
export const LOCALE_SHORT: Record<Locale, string> = {
  "pt-BR": "PT",
  en: "EN",
  es: "ES",
};

export function isLocale(value: string | undefined): value is Locale {
  return value === "pt-BR" || value === "en" || value === "es";
}

export function setLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
