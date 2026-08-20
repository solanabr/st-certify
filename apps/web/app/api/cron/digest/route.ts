import type { NextRequest } from "next/server";
import { apiRoute } from "@/lib/api";
import { getPendingForSigner } from "@/lib/db/certificator-queries";
import { dbConfigured, getServiceClient } from "@/lib/db/mutations";
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

interface SignerWalletRow {
  wallet: string;
}

interface InviteEmailRow {
  wallet: string | null;
  email: string;
}

export async function GET(request: NextRequest) {
  return apiRoute(async () => {
    requireCronSecret(request);

    if (!dbConfigured) {
      return { signers: 0, notified: 0, skipped: 0 };
    }

    const wallets = await listSignerWallets();
    const emailByWallet = await resolveSignerEmails(wallets);

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

function requireCronSecret(request: NextRequest): void {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    fail("UNAUTHORIZED", "Acesso negado.");
  }
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}

async function listSignerWallets(): Promise<string[]> {
  const { data, error } = await getServiceClient()
    .from("edition_signers")
    .select("wallet");
  if (error) {
    fail("INTERNAL", "Falha ao listar signatários.", {
      detail: error.message,
      retryable: true,
    });
  }
  const rows = (data ?? []) as SignerWalletRow[];
  return [...new Set(rows.map((row) => row.wallet).filter(Boolean))];
}

/**
 * wallet → email, from the invites a signer accepted. Missing table (before
 * migration 0005 lands) or a read failure degrades to "no emails known", which
 * the caller reports as skips.
 */
async function resolveSignerEmails(
  wallets: string[],
): Promise<Map<string, string>> {
  const byWallet = new Map<string, string>();
  if (wallets.length === 0) {
    return byWallet;
  }

  const { data, error } = await getServiceClient()
    .from("signer_invites")
    .select("wallet, email")
    .in("wallet", wallets);
  if (error) {
    console.warn("[cron:digest] signer emails unavailable:", error.message);
    return byWallet;
  }

  for (const row of (data ?? []) as InviteEmailRow[]) {
    if (row.wallet && row.email && !byWallet.has(row.wallet)) {
      byWallet.set(row.wallet, row.email);
    }
  }
  return byWallet;
}
