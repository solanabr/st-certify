import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { apiRoute } from "@/lib/api";
import { getPendingForSigner } from "@/lib/db/certificator-queries";
import { dbConfigured } from "@/lib/db/mutations";
import {
  listAllSignerWallets,
  signerEmailsByWallet,
} from "@/lib/db/notification-queries";
import { notifyOnce } from "@/lib/email/notify";
import { fail } from "@/lib/errors";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

/**
 * Daily digest (vercel.json cron, 12:00 UTC): one notice per signer per
 * edition with requests still waiting on their signature. `notifyOnce` with a
 * 20-hour interval is what keeps a re-run — or a manual curl — from mailing
 * the same signer twice in a day.
 *
 * Signers whose email we don't know (invited before the overhaul, or added by
 * raw wallet) are counted as skipped rather than failing the run.
 */
const MIN_INTERVAL_HOURS = 20;

export async function GET(request: NextRequest) {
  return apiRoute(async () => {
    requireCronSecret(request);

    if (!dbConfigured) {
      return { signers: 0, notified: 0, skipped: 0 };
    }

    const wallets = await listAllSignerWallets();
    const emailByWallet = await signerEmailsByWallet(wallets);

    let signers = 0;
    let notified = 0;
    let skipped = 0;

    for (const wallet of wallets) {
      const groups = await getPendingForSigner([wallet]);
      const pending = groups.filter((group) => group.certificates.length > 0);
      if (pending.length === 0) {
        continue;
      }
      signers += 1;

      const to = emailByWallet.get(wallet);
      if (!to) {
        skipped += 1;
        console.warn(`[cron:digest] no known email for signer ${wallet}`);
        continue;
      }

      for (const group of pending) {
        const result = await notifyOnce({
          to,
          kind: "requests-pending",
          locale: DEFAULT_LOCALE,
          refId: group.editionAddress,
          payload: {
            editionName: group.editionName,
            count: group.certificates.length,
            signUrl: `${appBaseUrl()}/sign`,
          },
          minIntervalHours: MIN_INTERVAL_HOURS,
        });
        if (result.sent) {
          notified += 1;
        }
      }
    }

    return { signers, notified, skipped };
  });
}

/**
 * Fails closed when `CRON_SECRET` is unset — an unguarded digest endpoint is
 * an open mail relay for anyone who can name a signer.
 *
 * The comparison is constant-time: `===` on strings stops at the first
 * differing byte, and this header is attacker-supplied and retryable at will,
 * which is the shape a timing oracle needs to recover a secret byte by byte.
 * `timingSafeEqual` requires equal lengths, so a length mismatch — which the
 * response time leaks regardless — is rejected before it.
 */
function requireCronSecret(request: NextRequest): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    fail("UNAUTHORIZED", "Acesso negado.");
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    fail("UNAUTHORIZED", "Acesso negado.");
  }
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}
