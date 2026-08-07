import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderCertificate } from "../render";
import { layoutSchema, type Layout } from "../layout";
import rawDefaultLayout from "../../../assets/templates/default-layout.json";

const TEMPLATE_PATH = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "assets",
  "templates",
  "default-superteam-br.png",
);

const templatePng = readFileSync(TEMPLATE_PATH);
const baseLayout = layoutSchema.parse(rawDefaultLayout);

// The committed default layout ships with signatures: [] (bound per
// edition); add 2 sample boxes here to exercise the signature-block path.
const sampleLayout: Layout = {
  ...baseLayout,
  signatures: [
    { x: 0.15, y: 0.725, w: 0.2875, h: 0.1415, align: "center" },
    { x: 0.5625, y: 0.725, w: 0.2875, h: 0.1415, align: "center" },
  ],
};

const signers = [
  { name: "Ana Beatriz Souza", role: "Head de Comunidade" },
  { name: "Rafael Oliveira", role: "Diretor de Programas" },
];

function sampleValues(studentName: string) {
  return {
    studentName,
    dateText: "07/08/2026",
    certId: "CERT-TEST-0001",
    verifyUrl: "https://certify.example.com/verify/test",
  };
}

describe("renderCertificate", () => {
  it("is byte-deterministic: identical input produces identical sha256 (the M2 determinism gate)", async () => {
    const a = await renderCertificate({
      templatePng,
      layout: sampleLayout,
      values: sampleValues("Maria da Silva"),
      signers,
    });
    const b = await renderCertificate({
      templatePng,
      layout: sampleLayout,
      values: sampleValues("Maria da Silva"),
      signers,
    });

    expect(a.sha256hex).toBe(b.sha256hex);
    expect(a.png.equals(b.png)).toBe(true);
  });

  it("produces a different hash for a different student name", async () => {
    const a = await renderCertificate({
      templatePng,
      layout: sampleLayout,
      values: sampleValues("Maria da Silva"),
      signers,
    });
    const b = await renderCertificate({
      templatePng,
      layout: sampleLayout,
      values: sampleValues("João Pereira"),
      signers,
    });

    expect(a.sha256hex).not.toBe(b.sha256hex);
  });

  it("rejects a signers/signature-boxes count mismatch instead of silently truncating", async () => {
    await expect(
      renderCertificate({
        templatePng,
        layout: sampleLayout,
        values: sampleValues("Maria da Silva"),
        signers: [signers[0]],
      }),
    ).rejects.toThrow();
  });
});
