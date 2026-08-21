import "server-only";

import { dbConfigured, getServiceClient } from "@/lib/db/mutations";
import type { NotificationLogRow } from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/locales";
import { sendEmail } from "./send";
import type { EmailKind, EmailPayloads } from "./templates";

type NotificationLogInsert = Pick<
  NotificationLogRow,
  "type" | "recipient" | "ref_id"
>;

export interface NotifyArgs<K extends EmailKind> {
  to: string;
  kind: K;
  locale: Locale;
  /**
   * What this notice is *about* — an edition or certificate address, an invite
   * id. Together with `kind` and `to` it forms the idempotency key.
   */
  refId: string;
  payload: EmailPayloads[K];
  /**
   * Turns "exactly once, ever" into "at most once per N hours" — for the
   * recurring kinds (digest, reminder) that legitimately repeat.
   */
  minIntervalHours?: number;
}

export interface NotifyResult {
  sent: boolean;
  deduped: boolean;
}

/**
 * Sends an email at most once per (kind, recipient, ref) — the ledger is
 * `notification_log`, so the guarantee survives retries, redeploys and the
 * daily cron re-running.
 *
 * Errors on the log side never silence a notification: a certificate-ready
 * email that never arrives is a worse failure than a duplicate one, so a
 * failed read falls through to sending. A send that didn't happen is never
 * recorded, which leaves the next attempt free to retry.
 */
export async function notifyOnce<K extends EmailKind>(
  args: NotifyArgs<K>,
): Promise<NotifyResult> {
  const { to, kind, locale, refId, payload, minIntervalHours } = args;

  if (!dbConfigured) {
    const result = await sendEmail(to, kind, locale, payload);
    return { sent: result.sent, deduped: false };
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("notification_log")
    .select("sent_at")
    .eq("type", kind)
    .eq("recipient", to)
    .eq("ref_id", refId)
    .order("sent_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error(
      `[notify] log read failed for ${kind}/${refId}:`,
      error.message,
    );
  } else {
    const lastSentAt = (data as Array<{ sent_at: string }> | null)?.[0]
      ?.sent_at;
    if (lastSentAt && !intervalElapsed(lastSentAt, minIntervalHours)) {
      return { sent: false, deduped: true };
    }
  }

  const result = await sendEmail(to, kind, locale, payload);
  if (!result.sent) {
    return { sent: false, deduped: false };
  }

  const insert: NotificationLogInsert = {
    type: kind,
    recipient: to,
    ref_id: refId,
  };
  const { error: insertError } = await supabase
    .from("notification_log")
    .insert(insert);
  if (insertError) {
    console.error(
      `[notify] log write failed for ${kind}/${refId}:`,
      insertError.message,
    );
  }

  return { sent: true, deduped: false };
}

/** No interval means "never again"; otherwise the clock has to have run out. */
function intervalElapsed(
  lastSentAt: string,
  minIntervalHours: number | undefined,
): boolean {
  if (minIntervalHours === undefined) {
    return false;
  }
  const last = Date.parse(lastSentAt);
  if (Number.isNaN(last)) {
    return true;
  }
  return Date.now() - last >= minIntervalHours * 60 * 60 * 1000;
}
