import { describe, it, expect } from "vitest";
import {
  layoutSchema,
  editionReadyLayoutSchema,
  canonicalizeLayout,
  type Layout,
} from "../layout";
import { specHash, specHashBytes } from "../spec-hash";

const baseLayout: Layout = {
  version: 1,
  canvas: { width: 1600, height: 1131 },
  template: { sha256: "0".repeat(64) },
  signers: [
    {
      wallet: "11111111111111111111111111111111",
      name: "Ana Souza",
      role: "Head",
    },
    {
      wallet: "So11111111111111111111111111111111111111",
      name: "Rafael Oliveira",
      role: "Diretor",
    },
  ],
  fields: {
    student_name: {
      x: 0,
      y: 0.4067,
      w: 1,
      h: 0.0973,
      size: 0.0601,
      color: "#FFFFFF",
      align: "center",
      font: "inter",
      weight: 600,
    },
    date: {
      x: 0,
      y: 0.5234,
      w: 1,
      h: 0.0389,
      size: 0.0212,
      color: "#94A3B8",
      align: "center",
      font: "inter",
      weight: 400,
    },
    cert_id: {
      x: 0,
      y: 0.9231,
      w: 1,
      h: 0.0283,
      size: 0.0141,
      color: "#94A3B8",
      align: "center",
      font: "inter",
      weight: 400,
    },
    qr: { x: 0.8813, y: 0.672, size: 0.1149 },
  },
  signatures: [
    { x: 0.15, y: 0.725, w: 0.2875, h: 0.1415, align: "center" },
    { x: 0.5625, y: 0.725, w: 0.2875, h: 0.1415, align: "center" },
  ],
};

describe("layoutSchema", () => {
  it("accepts a fully populated layout", () => {
    expect(() => layoutSchema.parse(baseLayout)).not.toThrow();
  });

  it("accepts zero signers (a draft/template scaffold, e.g. the committed default)", () => {
    expect(() =>
      layoutSchema.parse({ ...baseLayout, signers: [] }),
    ).not.toThrow();
  });

  it("rejects more than 6 signers", () => {
    const sevenSigners = Array.from({ length: 7 }, (_, i) => ({
      wallet: "11111111111111111111111111111111",
      name: `Signer ${i}`,
      role: "Role",
    }));
    expect(() =>
      layoutSchema.parse({ ...baseLayout, signers: sevenSigners }),
    ).toThrow();
  });

  it("editionReadyLayoutSchema rejects fewer than 2 signers", () => {
    expect(() =>
      editionReadyLayoutSchema.parse({
        ...baseLayout,
        signers: [baseLayout.signers[0]],
      }),
    ).toThrow();
    expect(() =>
      editionReadyLayoutSchema.parse({ ...baseLayout, signers: [] }),
    ).toThrow();
  });

  it("editionReadyLayoutSchema accepts 2-6 signers", () => {
    expect(() => editionReadyLayoutSchema.parse(baseLayout)).not.toThrow();
  });
});

describe("canonicalizeLayout", () => {
  it("produces the same canonical string regardless of object key order", () => {
    const reordered: Layout = {
      signatures: baseLayout.signatures,
      fields: {
        qr: baseLayout.fields.qr,
        cert_id: baseLayout.fields.cert_id,
        date: baseLayout.fields.date,
        student_name: baseLayout.fields.student_name,
      },
      signers: baseLayout.signers,
      template: baseLayout.template,
      canvas: {
        height: baseLayout.canvas.height,
        width: baseLayout.canvas.width,
      },
      version: baseLayout.version,
    };

    expect(Object.keys(reordered)).not.toEqual(Object.keys(baseLayout));
    expect(canonicalizeLayout(reordered)).toBe(canonicalizeLayout(baseLayout));
  });

  it("rounds numbers to 4 decimals", () => {
    const noisy: Layout = {
      ...baseLayout,
      fields: {
        ...baseLayout.fields,
        qr: { x: 0.12345678, y: 0.672, size: 0.1149 },
      },
    };
    const canonical = canonicalizeLayout(noisy);
    expect(canonical).toContain('"x":0.1235');
    expect(canonical).not.toContain("0.12345678");
  });

  it("is minified (no pretty-print indentation/newlines around structural tokens)", () => {
    // Note: string VALUES may legitimately contain spaces (e.g. "Rafael
    // Oliveira"), so this checks for pretty-print signatures specifically,
    // not "no whitespace anywhere".
    const canonical = canonicalizeLayout(baseLayout);
    expect(canonical).not.toContain("\n");
    expect(canonical).not.toContain(": ");
    expect(canonical).toBe(JSON.stringify(JSON.parse(canonical)));
  });
});

describe("specHash / specHashBytes", () => {
  it("is stable under key order shuffle (same canonical string ⇒ same hash)", () => {
    const reordered: Layout = {
      signatures: baseLayout.signatures,
      fields: baseLayout.fields,
      signers: baseLayout.signers,
      template: baseLayout.template,
      canvas: {
        height: baseLayout.canvas.height,
        width: baseLayout.canvas.width,
      },
      version: baseLayout.version,
    };

    expect(specHash(reordered)).toBe(specHash(baseLayout));
  });

  it("returns a 64-char lowercase hex string, and matching raw bytes", () => {
    const hex = specHash(baseLayout);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);

    const bytes = specHashBytes(baseLayout);
    expect(bytes).toHaveLength(32);
    expect(Buffer.from(bytes).toString("hex")).toBe(hex);
  });

  it("changes when the layout's content changes", () => {
    const changed: Layout = {
      ...baseLayout,
      fields: {
        ...baseLayout.fields,
        date: { ...baseLayout.fields.date, x: 0.1 },
      },
    };
    expect(specHash(changed)).not.toBe(specHash(baseLayout));
  });
});
