import { describe, expect, it } from "vitest";
import { generateClaimToken, generateNonce } from "../token";

describe("token", () => {
  it("is base64url and long enough", () => {
    const t = generateClaimToken();
    expect(t.length).toBeGreaterThanOrEqual(22);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("does not collide over 1000 draws", () => {
    const seen = new Set(Array.from({ length: 1000 }, generateClaimToken));
    expect(seen.size).toBe(1000);
    expect(generateNonce()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
