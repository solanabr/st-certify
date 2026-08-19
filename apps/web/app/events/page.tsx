import type { Metadata } from "next";
import { EventsDashboard } from "@/components/attendance/events-dashboard";
import { getT } from "@/lib/i18n/server";

// Creator-gated + live data — rendering at request time (like /verify/[id],
// /editions) keeps `next build` from depending on a reachable DB.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("attendance.events.title") };
}

export default function EventsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <EventsDashboard />
    </div>
  );
}
