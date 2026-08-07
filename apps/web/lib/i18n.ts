"use client";

import { useCallback, useEffect, useState } from "react";

export type Locale = "pt-BR" | "en";

export const DEFAULT_LOCALE: Locale = "pt-BR";
const LOCALE_COOKIE = "certify_locale";

const dictionaries = {
  "pt-BR": {
    "nav.home": "Início",
    "nav.me": "Meus certificados",
    "nav.admin": "Administração",
    "verify.title": "Verificar certificado",
    "verify.scanPrompt": "Escaneie o QR code ou cole o endereço do certificado",
    "sign.title": "Assinar certificados",
    "sign.pendingCount": "{count} certificados pendentes",
    "claim.title": "Resgatar certificado",
    "claim.success": "Certificado resgatado com sucesso",
    "common.loading": "Carregando...",
  },
  en: {
    "nav.home": "Home",
    "nav.me": "My certificates",
    "nav.admin": "Admin",
    "verify.title": "Verify certificate",
    "verify.scanPrompt": "Scan the QR code or paste the certificate address",
    "sign.title": "Sign certificates",
    "sign.pendingCount": "{count} pending certificates",
    "claim.title": "Claim certificate",
    "claim.success": "Certificate claimed successfully",
    "common.loading": "Loading...",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type TranslationKey = keyof (typeof dictionaries)["pt-BR"];

function isLocale(value: string | undefined): value is Locale {
  return value === "pt-BR" || value === "en";
}

function readLocaleCookie(): Locale {
  if (typeof document === "undefined") {
    return DEFAULT_LOCALE;
  }
  const match = document.cookie.match(/(?:^|;\s*)certify_locale=([^;]+)/);
  const value = match?.[1];
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function setLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function useT(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
} {
  // Starts at the default and syncs from the cookie after mount, to avoid
  // an SSR/client hydration mismatch — default is also pt-BR either way.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(readLocaleCookie());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleCookie(next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => dictionaries[locale][key],
    [locale],
  );

  return { locale, setLocale, t };
}
