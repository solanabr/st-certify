import "server-only";

import { dbConfigured, getServiceClient } from "@/lib/db/mutations";
import type { NotificationLogRow } from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/locales";
import { sendEmail } from "./send";
import type { EmailKind, EmailPayloads } from "./templates";

type NotificationLogInsert = Pick<
  NotificationLogRow,
  "type" | "recipient" | "ref_id" | "sent_at"
>;

/** The three columns 0008's unique index covers — one send per key. */
type LedgerKey = Pick<NotificationLogRow, "type" | "recipient" | "ref_id">;

/** Postgres `unique_violation`: another worker got to this key first. */
const UNIQUE_VIOLATION = "23505";

/**
 * Whether this call owns the send:
 * - `won` — the ledger row is ours; release it if the provider then refuses.
 * - `lost` — someone else owns it, or it already went out.
 * - `unguarded` — the ledger is unreachable; send anyway, nothing to release.
 */
type ClaimOutcome = "won" | "lost" | "unguarded";

interface LedgerRead {
  /** False when the log could not be read — dedupe is skipped, not enforced. */
  readable: boolean;
  sentAt: string | null;
}

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
 * The row is claimed *before* the provider call, never after. Reading first
 * and writing on the way out leaves hundreds of milliseconds in which a second
 * worker reads the same "nothing sent" and mails the same person again — two
 * signers closing batches on one certificate, an overlapping digest, a
 * double-clicked reminder. Writing first makes the database the arbiter:
 * 0008's unique index turns the loser's insert into a 23505, and the recurring
 * kinds compare-and-swap `sent_at` the way `acceptInvite` swaps invite status.
 * Until 0008 is applied the writes cannot collide, so the dedupe degrades to
 * exactly the best-effort it is today — the statements are correct either way.
 *
 * Errors on the log side never silence a notification: a certificate-ready
 * email that never arrives is a worse failure than a duplicate one, so a failed
 * read or write falls through to sending. A claim whose send then fails is
 * released, which leaves the next attempt free to retry.
 */
export async function notifyOnce<K extends EmailKind>(
  args: NotifyArgs<K>,
): Promise<NotifyResult> {
  const { to, kind, locale, refId, payload, minIntervalHours } = args;

  if (!dbConfigured) {
    const result = await sendEmail(to, kind, locale, payload);
    return { sent: result.sent, deduped: false };
  }

  const key: LedgerKey = { type: kind, recipient: to, ref_id: refId };
  const ledger = await readLastSentAt(key);

  if (
    ledger.readable &&
    ledger.sentAt !== null &&
    !intervalElapsed(ledger.sentAt, minIntervalHours)
  ) {
    return { sent: false, deduped: true };
  }

  const claimedAt = new Date().toISOString();
  const claim = !ledger.readable
    ? "unguarded"
    : ledger.sentAt === null
      ? await claimByInsert(key, claimedAt)
      : await claimByAdvance(key, ledger.sentAt, claimedAt);

  if (claim === "lost") {
    return { sent: false, deduped: true };
  }

  const result = await sendEmail(to, kind, locale, payload);

  if (!result.sent) {
    if (claim === "won") {
      await releaseClaim(key, claimedAt, ledger.sentAt);
    }
    return { sent: false, deduped: false };
  }

  if (!ledger.readable) {
    // Nothing was claimed up front because the log could not be read; record
    // the send after the fact so the next attempt still has something to see.
    await recordSend(key, claimedAt);
  }

  return { sent: true, deduped: false };
}

/** Newest send for this key, or `readable: false` if the log wouldn't answer. */
async function readLastSentAt(key: LedgerKey): Promise<LedgerRead> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("notification_log")
    .select("sent_at")
    .eq("type", key.type)
    .eq("recipient", key.recipient)
    .eq("ref_id", key.ref_id)
    .order("sent_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error(
      `[notify] log read failed for ${key.type}/${key.ref_id}:`,
      error.message,
    );
    return { readable: false, sentAt: null };
  }

  const rows = data as Array<{ sent_at: string }> | null;
  return { readable: true, sentAt: rows?.[0]?.sent_at ?? null };
}

/**
 * First claim on a key nobody has mailed yet. Post-0008 exactly one concurrent
 * insert lands and the rest come back 23505; pre-0008 they all land, which is
 * the same best-effort behaviour the read-first version had.
 */
async function claimByInsert(
  key: LedgerKey,
  claimedAt: string,
): Promise<ClaimOutcome> {
  const supabase = getServiceClient();
  const insert: NotificationLogInsert = { ...key, sent_at: claimedAt };
  const { error } = await supabase.from("notification_log").insert(insert);

  if (!error) {
    return "won";
  }
  if (error.code === UNIQUE_VIOLATION) {
    return "lost";
  }
  console.error(
    `[notify] log claim failed for ${key.type}/${key.ref_id}:`,
    error.message,
  );
  return "unguarded";
}

/**
 * Re-claim of a recurring kind whose interval has run out. The update only
 * matches while `sent_at` still holds the value we read, so a second caller
 * racing on the same row changes nothing and backs off — the compare-and-swap
 * `lib/db/draft-mutations.ts#acceptInvite` uses on invite status.
 */
async function claimByAdvance(
  key: LedgerKey,
  seenSentAt: string,
  claimedAt: string,
): Promise<ClaimOutcome> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("notification_log")
    .update({ sent_at: claimedAt })
    .eq("type", key.type)
    .eq("recipient", key.recipient)
    .eq("ref_id", key.ref_id)
    .eq("sent_at", seenSentAt)
    .select("sent_at");

  if (error) {
    console.error(
      `[notify] log claim failed for ${key.type}/${key.ref_id}:`,
      error.message,
    );
    return "unguarded";
  }

  const rows = data as Array<{ sent_at: string }> | null;
  return rows && rows.length > 0 ? "won" : "lost";
}

/**
 * A claim only means "this send is mine". If the provider then refuses it,
 * holding the claim would dedupe every later attempt against an email that
 * never went out — so it is handed back, guarded by the timestamp we wrote so
 * a concurrent claim is never the one undone.
 */
async function releaseClaim(
  key: LedgerKey,
  claimedAt: string,
  previousSentAt: string | null,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } =
    previousSentAt === null
      ? await supabase
          .from("notification_log")
          .delete()
          .eq("type", key.type)
          .eq("recipient", key.recipient)
          .eq("ref_id", key.ref_id)
          .eq("sent_at", claimedAt)
      : await supabase
          .from("notification_log")
          .update({ sent_at: previousSentAt })
          .eq("type", key.type)
          .eq("recipient", key.recipient)
          .eq("ref_id", key.ref_id)
          .eq("sent_at", claimedAt);

  if (error) {
    console.error(
      `[notify] claim release failed for ${key.type}/${key.ref_id} — the next attempt will be deduped against an email that never went out:`,
      error.message,
    );
  }
}

/** Post-hoc ledger write for the path where the log couldn't be read first. */
async function recordSend(key: LedgerKey, sentAt: string): Promise<void> {
  const supabase = getServiceClient();
  const insert: NotificationLogInsert = { ...key, sent_at: sentAt };
  const { error } = await supabase.from("notification_log").insert(insert);
  if (error) {
    console.error(
      `[notify] log write failed for ${key.type}/${key.ref_id}:`,
      error.message,
    );
  }
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
