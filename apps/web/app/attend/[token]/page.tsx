import type { Metadata } from "next";
import { cache } from "react";
import { ClaimCard } from "@/components/attendance/claim-card";
import { checkClaimGate } from "@/lib/attendance/gate";
import { getEventByToken } from "@/lib/db/attendance-queries";
import { getT } from "@/lib/i18n/server";
import type { AttendanceEventRow } from "@/lib/db/types";
import type { ClaimPageInfo } from "@/app/api/attendance/claim/[token]/route";

export const dynamic = "force-dynamic";

// Deduped per request (React cache) so generateMetadata and the page body share
// a single DB read despite both needing the event.
const getEvent = cache((token: string) => getEventByToken(token));

/** Server-side snapshot for react-query `initialData` (UI-C1) — event half only; `callerClaim` is fetched client-side. */
function toInitialClaimInfo(event: AttendanceEventRow): ClaimPageInfo {
  const gate = checkClaimGate(event);
  const exhausted =
    event.max_supply !== null && event.minted_count >= event.max_supply;
  const state: ClaimPageInfo["state"] = !event.claim_open
    ? "paused"
    : !gate.ok
      ? "ended"
      : exhausted
        ? "exhausted"
        : "open";
  return {
    name: event.name,
    description: event.description,
    imageUrl: event.image_url,
    eventDate: event.event_date,
    endDate: event.end_date,
    location: event.location,
    mintedCount: event.minted_count,
    maxSupply: event.max_supply,
    state,
    callerClaim: null,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const event = await getEvent(token);
  const { t } = await getT();

  // A claim link is a private, single-use URL — never index it (P0-3). OG tags
  // still ship so a link shared in chat renders a rich preview.
  const robots = { index: false, follow: false } as const;
  if (!event) return { robots };

  const title = `${event.name} — ${t("attendance.claim.title")}`;
  const description =
    event.description ||
    t("attendance.nft.metaDescription", { name: event.name });
  return {
    title,
    description,
    robots,
    openGraph: { title, description, images: [{ url: event.image_url }] },
  };
}

export default async function AttendPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const event = await getEvent(token);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <ClaimCard
        token={token}
        initialEvent={event ? toInitialClaimInfo(event) : undefined}
      />
    </main>
  );
}
