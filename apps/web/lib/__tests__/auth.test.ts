import { describe, expect, it } from "vitest";
import { isAdminIdentity, parseAllowlist } from "../auth";

describe("parseAllowlist", () => {
  it("splits on commas, trims whitespace, and drops empty entries", () => {
    const set = parseAllowlist(
      " kaue@superteam.com.br , kuka@superteam.com.br,, ",
    );
    expect(set).toEqual(
      new Set(["kaue@superteam.com.br", "kuka@superteam.com.br"]),
    );
  });

  it("does not case-fold — callers decide (emails vs wallets need different rules)", () => {
    const set = parseAllowlist("Eccp5WL2sBcQGzxCPekX2FubvCzqz2RqAFZ6ieGZyMU9");
    expect(set.has("Eccp5WL2sBcQGzxCPekX2FubvCzqz2RqAFZ6ieGZyMU9")).toBe(true);
    expect(set.has("eccp5wl2sbcqgzxcpekx2fubvczqz2rqafz6iegzymu9")).toBe(false);
  });

  it("returns an empty set for undefined or empty input", () => {
    expect(parseAllowlist(undefined)).toEqual(new Set());
    expect(parseAllowlist("")).toEqual(new Set());
  });
});

describe("isAdminIdentity", () => {
  const ADMIN_EMAILS = "kaue@superteam.com.br,kuka@superteam.com.br";
  const ADMIN_WALLETS = "Eccp5WL2sBcQGzxCPekX2FubvCzqz2RqAFZ6ieGZyMU9";

  it("grants sysadmin for an allowlisted email, case-insensitively", () => {
    expect(
      isAdminIdentity("Kaue@Superteam.com.br", [], ADMIN_EMAILS, ADMIN_WALLETS),
    ).toBe(true);
  });

  it("grants sysadmin for an allowlisted wallet among several linked wallets", () => {
    expect(
      isAdminIdentity(
        null,
        ["SomeOtherWallet1111111111111111111", ADMIN_WALLETS],
        ADMIN_EMAILS,
        ADMIN_WALLETS,
      ),
    ).toBe(true);
  });

  it("denies a wallet that only matches the allowlist after case-folding — base58 is case-sensitive", () => {
    expect(
      isAdminIdentity(
        null,
        [ADMIN_WALLETS.toLowerCase()],
        ADMIN_EMAILS,
        ADMIN_WALLETS,
      ),
    ).toBe(false);
  });

  it("denies a student identity with no matching email or wallet", () => {
    expect(
      isAdminIdentity(
        "student@example.com",
        ["RandomWallet1111111111111111111111"],
        ADMIN_EMAILS,
        ADMIN_WALLETS,
      ),
    ).toBe(false);
  });

  it("denies everyone when the allowlists are unset", () => {
    expect(
      isAdminIdentity("kaue@superteam.com.br", [], undefined, undefined),
    ).toBe(false);
  });

  it("denies a null email against an edition-signer wallet not on the admin list", () => {
    expect(
      isAdminIdentity(
        null,
        ["SignerWallet11111111111111111111"],
        ADMIN_EMAILS,
        ADMIN_WALLETS,
      ),
    ).toBe(false);
  });
});
