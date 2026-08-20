import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../rate-limit";

const WINDOW = 60_000;

describe("createRateLimiter", () => {
  it("allows the first hit and blocks the rest of a burst", () => {
    const take = createRateLimiter({ windowMs: WINDOW, max: 1 });

    expect(take("wallet-a", 0).allowed).toBe(true);
    expect(take("wallet-a", 10).allowed).toBe(false);
    expect(take("wallet-a", 500).allowed).toBe(false);
  });

  it("keeps keys independent", () => {
    const take = createRateLimiter({ windowMs: WINDOW, max: 1 });

    expect(take("wallet-a", 0).allowed).toBe(true);
    expect(take("wallet-a", 10).allowed).toBe(false);
    expect(take("wallet-b", 10).allowed).toBe(true);
  });

  it("allows up to max hits inside the window, then blocks", () => {
    const take = createRateLimiter({ windowMs: WINDOW, max: 5 });

    for (let i = 0; i < 5; i++) {
      expect(take("wallet-a", i).allowed).toBe(true);
    }
    expect(take("wallet-a", 6).allowed).toBe(false);
  });

  it("frees the slot once the window has passed", () => {
    const take = createRateLimiter({ windowMs: WINDOW, max: 1 });

    expect(take("wallet-a", 0).allowed).toBe(true);
    expect(take("wallet-a", WINDOW - 1).allowed).toBe(false);
    expect(take("wallet-a", WINDOW).allowed).toBe(true);
  });

  it("reports the seconds left until the window frees up", () => {
    const take = createRateLimiter({ windowMs: WINDOW, max: 1 });

    take("wallet-a", 0);
    expect(take("wallet-a", 0).retryAfterSeconds).toBe(60);
    expect(take("wallet-a", 30_000).retryAfterSeconds).toBe(30);
    expect(take("wallet-a", 59_500).retryAfterSeconds).toBe(1);
  });

  it("reports no wait when the hit is allowed", () => {
    const take = createRateLimiter({ windowMs: WINDOW, max: 1 });

    expect(take("wallet-a", 0)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("blocking a key does not extend its window", () => {
    const take = createRateLimiter({ windowMs: WINDOW, max: 1 });

    take("wallet-a", 0);
    take("wallet-a", 30_000); // blocked — must not count as a fresh hit
    expect(take("wallet-a", WINDOW).allowed).toBe(true);
  });
});
