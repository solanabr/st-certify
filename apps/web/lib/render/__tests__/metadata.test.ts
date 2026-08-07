import { describe, it, expect } from "vitest";
import { buildMetadataJson } from "../metadata";
import type { Layout } from "../layout";

const layout: Layout = {
  version: 1,
  canvas: { width: 1600, height: 1131 },
  template: { sha256: "0".repeat(64) },
  signers: [],
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
  signatures: [],
};

describe("buildMetadataJson", () => {
  it("round-trips through JSON and includes a render_spec sufficient to regenerate + verify the certificate", () => {
    const metadata = buildMetadataJson({
      editionName: "Bootcamp Solana",
      certNumber: 7,
      maxSupply: 50,
      artifactSha256Hex: "a".repeat(64),
      imageUrl: "https://example.com/certs/aaaa.png",
      externalUrl: "https://example.com/verify/aaaa",
      templateUrl: "https://example.com/templates/bbbb.png",
      layout,
      values: {
        studentName: "Maria da Silva",
        nameSaltHex: "c".repeat(64),
        dateText: "07/08/2026",
        certId: "CERT-0007",
      },
      signers: [
        {
          wallet: "11111111111111111111111111111111",
          name: "Ana Souza",
          role: "Head",
          txSig: "sig1",
        },
        {
          wallet: "So11111111111111111111111111111111111111",
          name: "Rafael Oliveira",
          role: "Diretor",
          txSig: null,
        },
      ],
    });

    // JSON round-trip sanity: nothing (undefined, NaN, bigint, ...) is lost or mangled.
    const roundTripped = JSON.parse(JSON.stringify(metadata));
    expect(roundTripped).toEqual(metadata);

    expect(metadata.name).toBe("Bootcamp Solana #7");
    expect(metadata.symbol).toBe("CERT");
    expect(metadata.image).toBe("https://example.com/certs/aaaa.png");
    expect(metadata.external_url).toBe("https://example.com/verify/aaaa");
    expect(metadata.attributes).toContainEqual({
      trait_type: "Artifact SHA-256",
      value: "a".repeat(64),
    });
    expect(metadata.attributes).toContainEqual({
      trait_type: "Cert Number",
      value: "#7 of 50",
    });

    expect(metadata.render_spec.version).toBe(1);
    expect(metadata.render_spec.template).toEqual({
      url: "https://example.com/templates/bbbb.png",
      sha256: "0".repeat(64),
    });
    expect(metadata.render_spec.layout).toEqual(layout);
    expect(metadata.render_spec.values).toEqual({
      student_name: "Maria da Silva",
      name_salt: "c".repeat(64),
      date_text: "07/08/2026",
      cert_id: "CERT-0007",
    });
    expect(metadata.render_spec.signers).toEqual([
      {
        wallet: "11111111111111111111111111111111",
        name: "Ana Souza",
        role: "Head",
        tx_sig: "sig1",
      },
      {
        wallet: "So11111111111111111111111111111111111111",
        name: "Rafael Oliveira",
        role: "Diretor",
        tx_sig: null,
      },
    ]);

    expect(metadata.render_spec.fonts).toHaveLength(3);
    for (const font of metadata.render_spec.fonts) {
      expect(font.sha256).toMatch(/^[0-9a-f]{64}$/);
    }

    expect(metadata.render_spec.engine).toEqual({
      satori: "0.29.0",
      resvg: "2.6.2",
    });
    expect(metadata.render_spec.canvas).toEqual(layout.canvas);
  });

  it("omits the 'of M' suffix when maxSupply is not provided", () => {
    const metadata = buildMetadataJson({
      editionName: "Workshop",
      certNumber: 3,
      artifactSha256Hex: "b".repeat(64),
      imageUrl: "https://example.com/certs/bbbb.png",
      externalUrl: "https://example.com/verify/bbbb",
      templateUrl: "https://example.com/templates/cccc.png",
      layout,
      values: {
        studentName: "X",
        nameSaltHex: "d".repeat(64),
        dateText: "01/01/2026",
        certId: "CERT-0003",
      },
      signers: [],
    });

    expect(metadata.attributes).toContainEqual({
      trait_type: "Cert Number",
      value: "#3",
    });
    expect(metadata.name).toBe("Workshop #3");
  });

  it("uses a default pt-BR description when none is given", () => {
    const metadata = buildMetadataJson({
      editionName: "Workshop",
      certNumber: 1,
      artifactSha256Hex: "e".repeat(64),
      imageUrl: "https://example.com/certs/ee.png",
      externalUrl: "https://example.com/verify/ee",
      templateUrl: "https://example.com/templates/ff.png",
      layout,
      values: {
        studentName: "X",
        nameSaltHex: "f".repeat(64),
        dateText: "01/01/2026",
        certId: "CERT-0001",
      },
      signers: [],
    });

    expect(metadata.description).toContain("Workshop");
    expect(metadata.description.length).toBeGreaterThan(0);
  });
});
