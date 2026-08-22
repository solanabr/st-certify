import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// The mirror reads, the renderer and the template store are mocked so this file
// is about one decision only: whether the export trusts the hash it is about to
// stamp. Hoisted above the import of the module under test, per vitest.
vi.mock("@/lib/db/queries", () => ({
  getCertificateByAddress: vi.fn(),
  getEditionByAddress: vi.fn(),
}));
vi.mock("@/lib/render/render", () => ({ renderCertificate: vi.fn() }));
vi.mock("@/lib/render/storage", () => ({
  getTemplateBytes: vi.fn(async () => Buffer.from("template")),
}));

const { getCertificateByAddress, getEditionByAddress } =
  await import("@/lib/db/queries");
const { renderCertificate } = await import("@/lib/render/render");
const { loadCertificatePdfSource } = await import("../source");

const ADDR = "CeRt1F1cAtEaDdReSs11111111111111111111111111";
const CANONICAL_SHA = "a".repeat(64);

const DEFAULT_LAYOUT: Record<string, unknown> = JSON.parse(
  readFileSync(
    path.join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "assets",
      "templates",
      "default-layout.json",
    ),
    "utf8",
  ),
);

const SIGNER = {
  position: 0,
  wallet: "Wa" + "k".repeat(30),
  name: "Ana Ribeiro",
  role: "Coordenadora",
  signature_image_url: null,
};

function certRow(overrides: Record<string, unknown> = {}) {
  return {
    address: ADDR,
    edition_address: "Ed" + "i".repeat(30),
    student_name: "João Antônio",
    status: "Claimed",
    sha256: CANONICAL_SHA,
    asset: "As" + "s".repeat(30),
    claim_tx: "5" + "z".repeat(63),
    signer_txs: [],
    completed_at: "2026-08-20T14:05:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function editionRow() {
  return {
    address: "Ed" + "i".repeat(30),
    slug: "turma-a",
    name: "Turma A",
    completionDate: "2026-08-15",
    layout: {
      ...DEFAULT_LAYOUT,
      signers: [
        { wallet: SIGNER.wallet, name: SIGNER.name, role: SIGNER.role },
      ],
      signatures: [{ x: 0.15, y: 0.72, w: 0.25, h: 0.12, align: "center" }],
    },
    signers: [SIGNER],
  };
}

/** Hands back `sha` for the canonical (scale-1) render, another for the print one. */
function renderYielding(sha: string): void {
  vi.mocked(renderCertificate).mockImplementation(async (input) => ({
    png: Buffer.from(input.scale ? "print-render" : "canonical-render"),
    sha256hex: input.scale ? "f".repeat(64) : sha,
  }));
}

function arrange(cert: Record<string, unknown> = {}): void {
  vi.mocked(getCertificateByAddress).mockResolvedValue(certRow(cert) as never);
  vi.mocked(getEditionByAddress).mockResolvedValue(editionRow() as never);
}

afterEach(() => {
  vi.mocked(getCertificateByAddress).mockReset();
  vi.mocked(getEditionByAddress).mockReset();
  vi.mocked(renderCertificate).mockReset();
  delete process.env.NEXT_PUBLIC_RPC_URL;
});

describe("loadCertificatePdfSource", () => {
  it("refuses to export when the re-render no longer matches the recorded hash", async () => {
    arrange();
    renderYielding("b".repeat(64));

    await expect(loadCertificatePdfSource(ADDR, "pt-BR")).rejects.toThrow(
      /reproduzir o certificado original/,
    );
    // Fails before the expensive print render — and before any bytes exist to
    // stamp the wrong hash onto.
    expect(renderCertificate).toHaveBeenCalledTimes(1);
  });

  it("builds from the print render once the canonical one reconciles", async () => {
    arrange();
    renderYielding(CANONICAL_SHA);

    const source = await loadCertificatePdfSource(ADDR, "pt-BR");

    expect(source?.artifactSha256Hex).toBe(CANONICAL_SHA);
    expect(Buffer.from(source!.input.png).toString()).toBe("print-render");
    expect(renderCertificate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(renderCertificate).mock.calls[0][0].scale).toBeUndefined();
    expect(vi.mocked(renderCertificate).mock.calls[1][0].scale).toBeGreaterThan(
      1,
    );
  });

  it("returns null for a certificate that was never claimed", async () => {
    arrange({ status: "FullySigned" });
    renderYielding(CANONICAL_SHA);

    expect(await loadCertificatePdfSource(ADDR, "pt-BR")).toBeNull();
    expect(renderCertificate).not.toHaveBeenCalled();
  });

  it("prints the cluster the claim recorded, not the one the server is pointed at", async () => {
    process.env.NEXT_PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";
    arrange({ cluster: "devnet" });
    renderYielding(CANONICAL_SHA);

    const source = await loadCertificatePdfSource(ADDR, "pt-BR");

    expect(source?.input.cluster).toBe("devnet");
  });

  it("falls back to the environment for rows written before 0006", async () => {
    process.env.NEXT_PUBLIC_RPC_URL = "https://api.devnet.solana.com";
    arrange({ cluster: undefined });
    renderYielding(CANONICAL_SHA);

    const source = await loadCertificatePdfSource(ADDR, "pt-BR");

    expect(source?.input.cluster).toBe("devnet");
  });
});
