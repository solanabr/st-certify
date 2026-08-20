import { describe, expect, it } from "vitest";
import {
  authNonceSchema,
  authVerifySchema,
  claimSchema,
  createEventSchema,
  eventActionSchema,
} from "../schemas";

const WALLET = "ENn4h8RZGXfXhmU6LQKZtujWjddpvYhT4NXWhNacvHsb";
const TINY_PNG = `data:image/png;base64,${Buffer.from("png!").toString("base64")}`;

describe("createEventSchema", () => {
  const valid = {
    name: "  Meetup SP  ",
    description: "Encontro mensal",
    eventDate: "2026-09-01",
    imageDataUrl: TINY_PNG,
    maxSupply: 100,
  };

  it("trims and accepts a valid input", () => {
    const r = createEventSchema.parse(valid);
    expect(r.name).toBe("Meetup SP");
    expect(r.claimDeadline).toBeUndefined();
  });

  it("rejects >32-char names, bad dates, oversized/wrong-type images", () => {
    expect(
      createEventSchema.safeParse({ ...valid, name: "x".repeat(33) }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({ ...valid, eventDate: "01/09/2026" })
        .success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({
        ...valid,
        imageDataUrl: "data:image/gif;base64,AAAA",
      }).success,
    ).toBe(false);
    const big = `data:image/png;base64,${Buffer.alloc(2_100_000).toString("base64")}`;
    expect(
      createEventSchema.safeParse({ ...valid, imageDataUrl: big }).success,
    ).toBe(false);
  });
});

describe("createEventSchema — metadata expansion fields (0004)", () => {
  const base = {
    name: "Meetup SP",
    eventDate: "2026-09-01",
    imageDataUrl: TINY_PNG,
  };

  it("defaults location to '' and leaves endDate/eventUrl undefined", () => {
    const r = createEventSchema.parse(base);
    expect(r.location).toBe("");
    expect(r.endDate).toBeUndefined();
    expect(r.eventUrl).toBeUndefined();
  });

  it("accepts the full POAP-style payload", () => {
    const r = createEventSchema.parse({
      ...base,
      endDate: "2026-09-03",
      location: "São Paulo, Brasil",
      eventUrl: "https://lu.ma/meetupsp",
    });
    expect(r.endDate).toBe("2026-09-03");
    expect(r.location).toBe("São Paulo, Brasil");
    expect(r.eventUrl).toBe("https://lu.ma/meetupsp");
  });

  it("rejects an end date before the event date, accepts same-day", () => {
    const before = createEventSchema.safeParse({
      ...base,
      endDate: "2026-08-31",
    });
    expect(before.success).toBe(false);
    if (!before.success) {
      expect(before.error.issues[0]?.path).toEqual(["endDate"]);
    }
    expect(
      createEventSchema.safeParse({ ...base, endDate: "2026-09-01" }).success,
    ).toBe(true);
  });

  it("rejects non-http(s) and malformed event URLs", () => {
    for (const bad of ["ftp://files.example", "not a url", "javascript:x"]) {
      expect(
        createEventSchema.safeParse({ ...base, eventUrl: bad }).success,
      ).toBe(false);
    }
  });

  it("caps the location at 80 characters", () => {
    expect(
      createEventSchema.safeParse({ ...base, location: "x".repeat(81) })
        .success,
    ).toBe(false);
  });
});

describe("claimSchema / eventActionSchema", () => {
  it("accepts signature and cookie-proof variants", () => {
    expect(
      claimSchema.safeParse({ token: "t".repeat(22), wallet: WALLET }).success,
    ).toBe(true);
    expect(
      claimSchema.safeParse({
        token: "t".repeat(22),
        wallet: WALLET,
        message: "m",
        signatureBase64: "aGk=",
      }).success,
    ).toBe(true);
    expect(
      claimSchema.safeParse({ token: "short", wallet: "not-base58" }).success,
    ).toBe(false);
  });

  it("action enum", () => {
    expect(eventActionSchema.safeParse({ action: "rotate" }).success).toBe(
      true,
    );
    expect(eventActionSchema.safeParse({ action: "delete" }).success).toBe(
      false,
    );
  });
});

describe("authVerifySchema", () => {
  it("accepts message+signatureBase64 present (SIWS path)", () => {
    expect(
      authVerifySchema.safeParse({
        wallet: WALLET,
        message: "m",
        signatureBase64: "aGk=",
      }).success,
    ).toBe(true);
  });

  it("accepts neither field present (Privy-session shortcut)", () => {
    expect(authVerifySchema.safeParse({ wallet: WALLET }).success).toBe(true);
  });

  it("rejects a non-base58 wallet", () => {
    expect(authVerifySchema.safeParse({ wallet: "not-base58" }).success).toBe(
      false,
    );
  });
});

describe("authNonceSchema", () => {
  it("accepts a valid wallet + purpose", () => {
    expect(
      authNonceSchema.safeParse({
        wallet: WALLET,
        purpose: "attendance-claim",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown purpose", () => {
    expect(
      authNonceSchema.safeParse({ wallet: WALLET, purpose: "bogus" }).success,
    ).toBe(false);
  });
});
