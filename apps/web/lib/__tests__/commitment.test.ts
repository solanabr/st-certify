import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeNameCommitment, generateNameSalt } from "../commitment";
import { studentNameSchema } from "../schemas";

describe("studentNameSchema (prepare-request sanitization)", () => {
  it("NFC-normalizes composed vs. decomposed accents to the same string", () => {
    // Built from explicit code points, not literal source characters — a
    // literal accented character in the source risks silent editor/tool
    // re-normalization, which would make the two forms identical before the
    // test even runs and the assertion would pass without testing anything.
    const precomposedE = String.fromCharCode(0x00e9); // single codepoint (NFC)
    const decomposedE = String.fromCharCode(0x0065, 0x0301); // e + combining acute (NFD)
    const composed = `Jos${precomposedE}`;
    const decomposed = `Jos${decomposedE}`;
    expect(composed).not.toBe(decomposed); // guard: inputs really do differ pre-normalization
    expect(studentNameSchema.parse(composed)).toBe(
      studentNameSchema.parse(decomposed),
    );
  });

  it("strips bidi control characters", () => {
    const rlo = String.fromCharCode(0x202e); // RIGHT-TO-LEFT OVERRIDE
    expect(studentNameSchema.parse(`Ana${rlo}cirla`)).toBe("Anacirla");
  });

  it("strips zero-width characters", () => {
    const zwsp = String.fromCharCode(0x200b); // ZERO WIDTH SPACE
    expect(studentNameSchema.parse(`Ana${zwsp}cirla`)).toBe("Anacirla");
  });

  it("collapses internal whitespace runs and trims", () => {
    expect(studentNameSchema.parse("  Ana   Beatriz  ")).toBe("Ana Beatriz");
  });

  it("rejects names with disallowed symbols", () => {
    // NAME_CHARSET is [\p{L}\p{M}\p{N} '\-.] — \p{N} (Unicode "Number")
    // deliberately allows digits, so this only asserts on symbols outside
    // that set, not on digits.
    expect(studentNameSchema.safeParse("Ana<script>").success).toBe(false);
    expect(studentNameSchema.safeParse("Ana@Beatriz").success).toBe(false);
  });

  it("rejects names shorter than 2 characters after sanitization", () => {
    expect(studentNameSchema.safeParse("A").success).toBe(false);
  });
});

describe("computeNameCommitment", () => {
  it("matches the on-chain spec exactly: sha256(salt || NFC(name))", () => {
    const salt = new Uint8Array(32).fill(7);
    const name = "Ana Beatriz";
    const expected = createHash("sha256")
      .update(salt)
      .update(Buffer.from(name, "utf8"))
      .digest();

    expect(computeNameCommitment(salt, name)).toEqual(expected);
  });

  it("is deterministic for the same salt and name", () => {
    const salt = new Uint8Array(32).fill(1);
    const a = computeNameCommitment(salt, "Rafael Oliveira");
    const b = computeNameCommitment(salt, "Rafael Oliveira");
    expect(a).toEqual(b);
  });

  it("produces a different commitment for a different salt (same name)", () => {
    const name = "Rafael Oliveira";
    const a = computeNameCommitment(new Uint8Array(32).fill(1), name);
    const b = computeNameCommitment(new Uint8Array(32).fill(2), name);
    expect(a).not.toEqual(b);
  });

  it("produces a different commitment for a different name (same salt)", () => {
    const salt = new Uint8Array(32).fill(1);
    const a = computeNameCommitment(salt, "Ana Beatriz");
    const b = computeNameCommitment(salt, "Ana Carolina");
    expect(a).not.toEqual(b);
  });

  it("is exactly 32 bytes (sha256 digest length)", () => {
    const commitment = computeNameCommitment(new Uint8Array(32), "Nome");
    expect(commitment).toHaveLength(32);
  });
});

describe("generateNameSalt", () => {
  it("generates 32 random bytes, different on every call", () => {
    const a = generateNameSalt();
    const b = generateNameSalt();
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
    expect(a).not.toEqual(b);
  });
});
