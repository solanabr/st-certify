export interface AttendanceMetadataInput {
  name: string;
  description: string;
  imageUrl: string;
  /** e.g. "image/png" — feeds properties.files[0].type. */
  imageMime: string;
  /** ISO date (yyyy-mm-dd). */
  eventDate: string;
  /** ISO date — omitted for single-day events. */
  endDate?: string;
  /** Freeform "city, country" (or "Online"); omitted when blank. */
  location?: string;
  /** Public event link (lu.ma, site); becomes external_url + an attribute. */
  eventUrl?: string;
  eventId: string;
}

export interface AttendanceMetadataJson {
  name: string;
  /** Type-named like the certificate flow's "CERT" — groups the asset class in wallets/explorers. */
  symbol: "ATTEND";
  description: string;
  image: string;
  external_url?: string;
  attributes: { trait_type: string; value: string }[];
  properties: {
    files: { uri: string; type: string }[];
    category: "image";
  };
}

/**
 * Offchain JSON (Metaplex non-fungible standard) — the cNFT `uri` target,
 * shared by every attendee of the event (one upload at event creation; the
 * per-attendee serial lives in the Bubblegum leaf name instead — see
 * attendanceLeafName). Attribute set follows POAP's event-metadata
 * convention (start/end dates, location, event URL, year) with this
 * platform's Title-Case trait names (matching the certificate metadata's
 * "Cert Number"/"Artifact SHA-256"). Optional attributes are omitted, not
 * emitted empty — wallets render every row they receive.
 */
export function buildAttendanceMetadata(
  i: AttendanceMetadataInput,
): AttendanceMetadataJson {
  const attributes: { trait_type: string; value: string }[] = [
    { trait_type: "Event Date", value: i.eventDate },
  ];
  if (i.endDate) attributes.push({ trait_type: "End Date", value: i.endDate });
  if (i.location)
    attributes.push({ trait_type: "Location", value: i.location });
  attributes.push({ trait_type: "Year", value: i.eventDate.slice(0, 4) });
  if (i.eventUrl)
    attributes.push({ trait_type: "Event URL", value: i.eventUrl });
  attributes.push(
    { trait_type: "Issuer", value: "Superteam Brasil" },
    { trait_type: "Event ID", value: i.eventId },
  );

  return {
    name: i.name,
    symbol: "ATTEND",
    description: i.description,
    image: i.imageUrl,
    ...(i.eventUrl ? { external_url: i.eventUrl } : {}),
    attributes,
    properties: {
      files: [{ uri: i.imageUrl, type: i.imageMime }],
      category: "image",
    },
  };
}

/** Bubblegum leaf names are capped at 32 BYTES — not characters. */
export const LEAF_NAME_MAX_BYTES = 32;

const utf8 = new TextEncoder();

/**
 * Per-attendee leaf name: "Event Name #42". The serial is the wallet's
 * capacity-slot number from attendance_reserve_claim (0004) — Bubblegum's
 * leaf metadata has no attributes, so the name is the only per-mint field,
 * and it is byte-limited on-chain. The event-name portion is truncated by
 * code point (never mid-emoji/accent) until name + suffix fit; the create
 * schema's 32-char cap does NOT guarantee 32 bytes for accented pt-BR names.
 * A null serial (defensive) falls back to the bare truncated name.
 */
export function attendanceLeafName(
  eventName: string,
  mintSerial: number | null,
): string {
  const suffix = mintSerial === null ? "" : ` #${mintSerial}`;
  const budget = LEAF_NAME_MAX_BYTES - utf8.encode(suffix).length;
  let name = eventName;
  while (name.length > 0 && utf8.encode(name).length > budget) {
    name = Array.from(name).slice(0, -1).join("");
  }
  return `${name}${suffix}`;
}
