export interface AttendanceMetadataInput {
  name: string;
  description: string;
  imageUrl: string;
  eventDate: string;
  eventId: string;
}

/** Offchain JSON (Metaplex non-fungible standard) — the cNFT `uri` target. */
export function buildAttendanceMetadata(i: AttendanceMetadataInput): {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string }[];
} {
  return {
    name: i.name,
    description: i.description,
    image: i.imageUrl,
    attributes: [
      { trait_type: "event_date", value: i.eventDate },
      { trait_type: "event_id", value: i.eventId },
      { trait_type: "issuer", value: "Superteam Brasil" },
    ],
  };
}
