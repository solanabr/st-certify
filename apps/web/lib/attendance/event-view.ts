import type { AttendanceEventRow } from "@/lib/db/types";

// Client-facing event shape + row mapper. Lives outside the route file
// because Next.js route modules may only export handlers — a helper export
// fails the build's route-type check (caught 2026-08-20).

/** Client-facing event shape — the creator dashboard and its hooks import this. */
export interface AttendanceEventView {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  eventDate: string;
  endDate: string | null;
  location: string;
  eventUrl: string;
  maxSupply: number | null;
  claimDeadline: string | null;
  claimOpen: boolean;
  mintedCount: number;
  claimUrl: string;
  createdAt: string;
}

export function toEventView(
  row: AttendanceEventRow,
  origin: string,
): AttendanceEventView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    eventDate: row.event_date,
    endDate: row.end_date,
    location: row.location,
    eventUrl: row.event_url,
    maxSupply: row.max_supply,
    claimDeadline: row.claim_deadline,
    claimOpen: row.claim_open,
    mintedCount: row.minted_count,
    claimUrl: `${origin}/attend/${row.claim_token}`,
    createdAt: row.created_at,
  };
}
