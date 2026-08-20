import { describe, expect, it } from "vitest";
import {
  attendanceLeafName,
  buildAttendanceMetadata,
  LEAF_NAME_MAX_BYTES,
} from "../metadata";

const utf8 = new TextEncoder();

describe("buildAttendanceMetadata", () => {
  it("shapes the offchain JSON with only the required attributes when optionals are absent", () => {
    const json = buildAttendanceMetadata({
      name: "Meetup SP",
      description: "Encontro mensal",
      imageUrl: "https://x/img.png",
      imageMime: "image/png",
      eventDate: "2026-09-01",
      eventId: "11111111-2222-3333-4444-555555555555",
    });
    expect(json).toEqual({
      name: "Meetup SP",
      symbol: "ATTEND",
      description: "Encontro mensal",
      image: "https://x/img.png",
      attributes: [
        { trait_type: "Event Date", value: "2026-09-01" },
        { trait_type: "Year", value: "2026" },
        { trait_type: "Issuer", value: "Superteam Brasil" },
        {
          trait_type: "Event ID",
          value: "11111111-2222-3333-4444-555555555555",
        },
      ],
      properties: {
        files: [{ uri: "https://x/img.png", type: "image/png" }],
        category: "image",
      },
    });
    expect(json).not.toHaveProperty("external_url");
  });

  it("carries the POAP-style optional attributes (end date, location, event URL) when provided", () => {
    const json = buildAttendanceMetadata({
      name: "Hackathon BR",
      description: "48h de build",
      imageUrl: "https://x/hack.webp",
      imageMime: "image/webp",
      eventDate: "2026-10-09",
      endDate: "2026-10-11",
      location: "São Paulo, Brasil",
      eventUrl: "https://lu.ma/hackbr",
      eventId: "evt-2",
    });
    expect(json.external_url).toBe("https://lu.ma/hackbr");
    expect(json.attributes).toEqual([
      { trait_type: "Event Date", value: "2026-10-09" },
      { trait_type: "End Date", value: "2026-10-11" },
      { trait_type: "Location", value: "São Paulo, Brasil" },
      { trait_type: "Year", value: "2026" },
      { trait_type: "Event URL", value: "https://lu.ma/hackbr" },
      { trait_type: "Issuer", value: "Superteam Brasil" },
      { trait_type: "Event ID", value: "evt-2" },
    ]);
  });
});

describe("attendanceLeafName", () => {
  it("appends the mint serial", () => {
    expect(attendanceLeafName("Meetup SP", 42)).toBe("Meetup SP #42");
  });

  it("falls back to the bare name when the serial is null", () => {
    expect(attendanceLeafName("Meetup SP", null)).toBe("Meetup SP");
  });

  it("keeps name + serial within the 32-byte on-chain cap", () => {
    // 32 chars of 2-byte characters = 64 bytes — over the cap even alone.
    const accented = "ç".repeat(32);
    const leaf = attendanceLeafName(accented, 16384);
    expect(utf8.encode(leaf).length).toBeLessThanOrEqual(LEAF_NAME_MAX_BYTES);
    expect(leaf.endsWith(" #16384")).toBe(true);
  });

  it("truncates by code point, never splitting a multi-byte character", () => {
    const emoji = "🎟️".repeat(12);
    const leaf = attendanceLeafName(emoji, 7);
    expect(utf8.encode(leaf).length).toBeLessThanOrEqual(LEAF_NAME_MAX_BYTES);
    // Re-encoding then decoding must round-trip — a split surrogate wouldn't.
    expect(new TextDecoder().decode(utf8.encode(leaf))).toBe(leaf);
    expect(leaf.endsWith(" #7")).toBe(true);
  });

  it("leaves 32-byte ASCII names + short serials intact", () => {
    const name = "a".repeat(26);
    expect(attendanceLeafName(name, 1)).toBe(`${name} #1`);
  });
});
