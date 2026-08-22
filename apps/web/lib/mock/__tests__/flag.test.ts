import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MOCK_ROLE,
  isUiMock,
  MOCK_ROLES,
  parseMockRole,
} from "../flag";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isUiMock", () => {
  it("is off by default — an unset flag never enables fixtures", () => {
    vi.stubEnv("NEXT_PUBLIC_UI_MOCK", undefined);
    vi.stubEnv("NODE_ENV", "development");
    expect(isUiMock()).toBe(false);
  });

  it("is on with the flag set outside production", () => {
    vi.stubEnv("NEXT_PUBLIC_UI_MOCK", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(isUiMock()).toBe(true);
  });

  // The whole point of the second half of the guard: a stray flag in a
  // deployed environment must not swap real data for fixtures.
  it("stays off in production even with the flag set", () => {
    vi.stubEnv("NEXT_PUBLIC_UI_MOCK", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(isUiMock()).toBe(false);
  });

  it("only accepts the exact opt-in value", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const value of ["", "0", "true", "yes", "2"]) {
      vi.stubEnv("NEXT_PUBLIC_UI_MOCK", value);
      expect(isUiMock()).toBe(false);
    }
  });
});

describe("parseMockRole", () => {
  it("round-trips every supported role", () => {
    for (const role of MOCK_ROLES) {
      expect(parseMockRole(role)).toBe(role);
    }
  });

  it("falls back to the default for a missing cookie", () => {
    expect(parseMockRole(undefined)).toBe(DEFAULT_MOCK_ROLE);
    expect(parseMockRole(null)).toBe(DEFAULT_MOCK_ROLE);
    expect(parseMockRole("")).toBe(DEFAULT_MOCK_ROLE);
  });

  it("falls back to the default for an unknown value", () => {
    expect(parseMockRole("superadmin")).toBe(DEFAULT_MOCK_ROLE);
    expect(parseMockRole("Admin")).toBe(DEFAULT_MOCK_ROLE);
  });

  it("defaults to admin, the widest UI surface", () => {
    expect(DEFAULT_MOCK_ROLE).toBe("admin");
  });
});
