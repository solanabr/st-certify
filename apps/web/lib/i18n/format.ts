import type { Locale } from "./locales";

/**
 * Date presets for UI chrome. Certificate *content* dates are deliberately
 * NOT formatted here: `lib/chain/claim.ts` pins them to pt-BR so the rendered
 * PNG's sha256 stays reproducible across prepare/submit and across readers.
 */
export type DateStyle = "date" | "dateTime" | "dayTime" | "full";

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: "medium" },
  dateTime: { dateStyle: "short", timeStyle: "short" },
  dayTime: {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  },
  full: { dateStyle: "long", timeStyle: "short" },
};

// Intl.DateTimeFormat construction dominates the cost of formatting; these
// were module-level consts before locale awareness, so keep them cached.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: Locale, style: DateStyle): Intl.DateTimeFormat {
  const cacheKey = `${locale}:${style}`;
  const cached = formatters.get(cacheKey);
  if (cached) {
    return cached;
  }
  const created = new Intl.DateTimeFormat(locale, OPTIONS[style]);
  formatters.set(cacheKey, created);
  return created;
}

/** Formats an ISO timestamp in the reader's locale. Unparseable input renders as an em dash rather than "Invalid Date". */
export function formatDate(
  iso: string,
  locale: Locale,
  style: DateStyle = "date",
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return formatter(locale, style).format(date);
}
