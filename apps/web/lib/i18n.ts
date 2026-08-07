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
    "verify.subtitle":
      "Cole o endereço ou o hash, ou envie o PNG do certificado.",
    "verify.inputPlaceholder": "Endereço, hash SHA-256 ou link do certificado",
    "verify.check": "Verificar",
    "verify.dropPrompt": "Solte o PNG aqui, ou clique para enviar",
    "verify.dropHint":
      "O arquivo é verificado pelo hash no seu navegador — nada é enviado ao servidor.",
    "verify.resolving": "Localizando certificado…",
    "verify.notFound": "Não encontrado",
    "verify.notFoundHint":
      "Confira o endereço, o hash, ou envie o PNG original do certificado.",
    "verify.threeWays":
      "Três formas de verificar: o endereço do certificado, o hash SHA-256, ou o arquivo PNG.",
    "claim.action": "Resgatar certificado",
    "claim.rendering": "Renderizando…",
    "claim.awaitingSignature": "Sua assinatura",
    "claim.confirming": "Confirmando…",
    "claim.minting": "Emitindo NFT…",
    "claim.done": "Certificado resgatado",
    "claim.copyLink": "Copiar link de verificação",
    "claim.copied": "Link copiado",
    "claim.download": "Baixar",
    "claim.viewNft": "Ver NFT no Explorer",
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
    "verify.subtitle":
      "Paste the address or hash, or upload the certificate PNG.",
    "verify.inputPlaceholder": "Certificate address, SHA-256 hash or link",
    "verify.check": "Verify",
    "verify.dropPrompt": "Drop the PNG here, or click to upload",
    "verify.dropHint":
      "The file is checked by its hash in your browser — nothing is uploaded to the server.",
    "verify.resolving": "Locating certificate…",
    "verify.notFound": "Not found",
    "verify.notFoundHint":
      "Check the address, the hash, or upload the original certificate PNG.",
    "verify.threeWays":
      "Three ways to verify: the certificate address, the SHA-256 hash, or the PNG file.",
    "claim.action": "Claim certificate",
    "claim.rendering": "Rendering…",
    "claim.awaitingSignature": "Your signature",
    "claim.confirming": "Confirming…",
    "claim.minting": "Minting NFT…",
    "claim.done": "Certificate claimed",
    "claim.copyLink": "Copy verification link",
    "claim.copied": "Link copied",
    "claim.download": "Download",
    "claim.viewNft": "View NFT on Explorer",
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
