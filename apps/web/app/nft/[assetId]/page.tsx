import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { explorerAddressUrl } from "@/lib/chain/explorer-url";
import { getClaimByAssetId } from "@/lib/db/attendance-queries";
import { BASE58_RE } from "@/lib/attendance/schemas";
import { getT } from "@/lib/i18n/server";

// Chain-truthful and per-request; a claim's asset id backfills asynchronously,
// so never serve a stale cached page.
export const dynamic = "force-dynamic";

// Deduped per request so generateMetadata and the page body share one DB read.
// The base58 guard runs before the query so a junk param never hits the DB.
const getClaim = cache((assetId: string) =>
  BASE58_RE.test(assetId) ? getClaimByAssetId(assetId) : Promise.resolve(null),
);

function truncateMiddle(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function formatEventDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ assetId: string }>;
}): Promise<Metadata> {
  const { assetId } = await params;
  const claim = await getClaim(assetId);
  const { t } = await getT();

  if (!claim) return { title: t("attendance.claim.title") };

  const title = `${claim.eventName} — ${t("attendance.claim.title")}`;
  const description = t("attendance.nft.metaDescription", {
    name: claim.eventName,
  });
  // Unlike /attend, this page is meant to be shared and previewed, so it's
  // indexable — no `robots` opt-out.
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: claim.eventImageUrl }] },
  };
}

export default async function NftPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  const claim = await getClaim(assetId);
  const { t, locale } = await getT();

  if (!claim) notFound();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            {t("attendance.claim.title")}
          </p>
          <h1 className="text-lg font-semibold">{claim.eventName}</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- content-addressed external artwork, not a local/Next-optimizable image */}
          <img
            src={claim.eventImageUrl}
            alt={claim.eventName}
            className="max-w-full rounded-lg"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {formatEventDate(claim.eventDate, locale)}
            </span>
            <span title={claim.wallet}>
              {t("attendance.nft.claimedBy", {
                wallet: truncateMiddle(claim.wallet),
              })}
            </span>
          </div>

          <a
            href={explorerAddressUrl(claim.assetId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {t("attendance.nft.viewExplorer")}
          </a>
        </CardContent>
      </Card>
    </main>
  );
}
