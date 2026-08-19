import { describe, expect, it } from "vitest";
import { buildAttendanceMetadata } from "../metadata";

describe("buildAttendanceMetadata", () => {
  it("shapes the offchain JSON", () => {
    const json = buildAttendanceMetadata({
      name: "Meetup SP",
      description: "Encontro mensal",
      imageUrl: "https://x/img.png",
      eventDate: "2026-09-01",
      eventId: "11111111-2222-3333-4444-555555555555",
    });
    expect(json).toEqual({
      name: "Meetup SP",
      description: "Encontro mensal",
      image: "https://x/img.png",
      attributes: [
        { trait_type: "event_date", value: "2026-09-01" },
        {
          trait_type: "event_id",
          value: "11111111-2222-3333-4444-555555555555",
        },
        { trait_type: "issuer", value: "Superteam Brasil" },
      ],
    });
  });
});
