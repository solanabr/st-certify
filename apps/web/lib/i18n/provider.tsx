"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { DEFAULT_LOCALE, setLocaleCookie, type Locale } from "./locales";
import {
  translate,
  type TranslateParams,
  type TranslationKey,
} from "./dictionaries";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Wraps the app with the active locale. `initialLocale` comes from the
 * server layout (cookie read via next/headers), so server-rendered HTML and
 * the first client render agree — no hydration mismatch, no locale flash.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleCookie(next);
    setLocaleState(next);
    // Keep the a11y-relevant lang attribute in sync without a reload;
    // server components re-render in the new locale on next navigation.
    document.documentElement.lang = next;
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useT(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslateParams) => string;
} {
  // Fall back to the default locale when rendered outside the provider
  // (isolated component tests) instead of crashing.
  const ctx = useContext(LocaleContext);
  const locale = ctx?.locale ?? DEFAULT_LOCALE;
  const setLocale = ctx?.setLocale ?? setLocaleCookie;

  const t = useCallback(
    (key: TranslationKey, params?: TranslateParams) =>
      translate(locale, key, params),
    [locale],
  );

  return { locale, setLocale, t };
}
