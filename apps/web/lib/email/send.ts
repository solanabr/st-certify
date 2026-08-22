import "server-only";

import type { Locale } from "@/lib/i18n/locales";
import { renderEmail, type EmailKind, type EmailPayloads } from "./templates";

export type { EmailKind, EmailPayloads, RenderedEmail } from "./templates";
export { EMAIL_KINDS, renderEmail } from "./templates";

export interface SendResult {
  sent: boolean;
  reason?: string;
}

/** False until RESEND_API_KEY and EMAIL_FROM are both set (spec §13). */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

let warnedUnconfigured = false;

/**
 * Delivers one transactional email and never throws: notifications ride along
 * with money-path routes (sign, claim, revoke), so a provider outage must not
 * turn a successful on-chain action into a failed request. Callers read
 * `sent`; the reason is for logs.
 *
 * Unconfigured environments (local dev, CI, preview) skip delivery with a
 * single warning, mirroring `dbConfigured`'s degrade-don't-crash posture.
 *
 * Failures log the kind, never the address: these lines land in retained
 * platform logs, and the recipient is the one part of an email that is
 * personal data. Callers already log kind + refId, which identifies the send.
 */
export async function sendEmail<K extends EmailKind>(
  to: string,
  kind: K,
  locale: Locale,
  payload: EmailPayloads[K],
): Promise<SendResult> {
  if (!to.trim()) {
    return { sent: false, reason: "no-recipient" };
  }
  if (!emailConfigured()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[email] RESEND_API_KEY/EMAIL_FROM unset — transactional emails are being skipped.",
      );
    }
    return { sent: false, reason: "unconfigured" };
  }

  const { subject, html, text } = renderEmail(kind, locale, payload);

  try {
    // Imported lazily so unconfigured deployments never pay for the SDK.
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "",
      to: to.trim(),
      subject,
      html,
      text,
    });
    if (error) {
      console.error(`[email] ${kind} failed:`, error.message);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[email] ${kind} threw:`, reason);
    return { sent: false, reason };
  }
}
