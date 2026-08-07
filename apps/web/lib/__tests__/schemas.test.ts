import { describe, it, expect } from "vitest";
import { editionWizardSchema } from "../schemas";
import { canonicalizeLayout, specHash, type Layout } from "../render/layout";

const validMeta = {
  name: "Bootcamp Solana 2026",
  slug: "bootcamp-solana-2026",
};

const validSigners = [
  { wallet: "11111111111111111111111111111111", name: "Ana", role: "Head" },
  {
    wallet: "So11111111111111111111111111111111111111",
    name: "Rafael",
    role: "Diretor",
  },
];

const validCustomLayout: Layout = {
  version: 1,
  canvas: { width: 1800, height: 1200 },
  template: { sha256: "a".repeat(64) },
  signers: validSigners,
  fields: {
    student_name: {
      x: 0.1,
      y: 0.4,
      w: 0.8,
      h: 0.1,
      size: 0.06,
      color: "#FFFFFF",
      align: "center",
      font: "inter",
      weight: 600,
    },
    date: {
      x: 0.1,
      y: 0.52,
      w: 0.8,
      h: 0.04,
      size: 0.02,
      color: "#94A3B8",
      align: "center",
      font: "inter",
      weight: 400,
    },
    cert_id: {
      x: 0.1,
      y: 0.92,
      w: 0.8,
      h: 0.03,
      size: 0.014,
      color: "#94A3B8",
      align: "center",
      font: "inter",
      weight: 400,
    },
    qr: { x: 0.86, y: 0.06, size: 0.1 },
  },
  signatures: [
    { x: 0.06, y: 0.78, w: 0.43, h: 0.12, align: "center" },
    { x: 0.51, y: 0.78, w: 0.43, h: 0.12, align: "center" },
  ],
};

describe("editionWizardSchema — templatePath / customLayout (M6)", () => {
  it("accepts the default path without a customLayout (M3 behavior unchanged)", () => {
    const result = editionWizardSchema.safeParse({
      meta: validMeta,
      signers: validSigners,
      templatePath: "default",
    });
    expect(result.success).toBe(true);
  });

  it("rejects the custom path when customLayout is missing", () => {
    const result = editionWizardSchema.safeParse({
      meta: validMeta,
      signers: validSigners,
      templatePath: "custom",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join(".") === "customLayout",
      );
      expect(issue).toBeDefined();
    }
  });

  it("accepts the custom path with a valid customLayout", () => {
    const result = editionWizardSchema.safeParse({
      meta: validMeta,
      signers: validSigners,
      templatePath: "custom",
      customLayout: validCustomLayout,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a custom path whose customLayout fails M2's own schema (e.g. malformed hash)", () => {
    const result = editionWizardSchema.safeParse({
      meta: validMeta,
      signers: validSigners,
      templatePath: "custom",
      customLayout: {
        ...validCustomLayout,
        template: { sha256: "not-a-valid-hash" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("a validated customLayout round-trips stably through canonicalizeLayout/specHash", () => {
    const parsed = editionWizardSchema.safeParse({
      meta: validMeta,
      signers: validSigners,
      templatePath: "custom",
      customLayout: validCustomLayout,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const layout = parsed.data.customLayout;
    expect(layout).toBeDefined();
    if (!layout) return;

    const hashA = specHash(layout);
    const hashB = specHash(layout);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalizeLayout(layout)).toBe(canonicalizeLayout(layout));
  });
});
