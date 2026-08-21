import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { VerifyCertView } from "@/lib/db/claim-verify-queries";
import { VerifyResult } from "../verify-result";

const VIEW: VerifyCertView = {
  address: "CeRt1F1cAtEaDdReSs1111111111111111111111111",
  editionAddress: "Ed1t10nAdDrEsS111111111111111111111111111",
  editionName: "Certificação Solana — Turma 2026",
  editionSlug: "solana-2026",
  studentName: "João Antônio de Assunção",
  status: "Claimed",
  signerBitmap: 3,
  certNumber: 7,
  maxSupply: 50,
  imageUrl: "https://cdn.test/cert.png",
  metadataUrl: "https://cdn.test/cert.json",
  sha256: "a".repeat(64),
  asset: "AsSeT1111111111111111111111111111111111111",
  revokeReason: null,
  completionDate: "2026-08-20",
  completedAt: "2026-08-20T14:05:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  verifyCode: "K7M2QX9T",
  signers: [
    {
      position: 0,
      name: "Ana Ribeiro",
      role: "Coordenadora",
      wallet: "Wa" + "l".repeat(30),
      signed: true,
      txSig: "3" + "y".repeat(63),
      signedAt: "2026-08-19T10:00:00.000Z",
    },
  ],
};

function render(view: VerifyCertView = VIEW): string {
  // The client islands inside the verdict share one chain-check query; SSR
  // renders it in its pending state, which is what a visitor sees first.
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <VerifyResult view={view} locale="pt-BR" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  delete process.env.ISSUER_NAME;
});

describe("VerifyResult", () => {
  it("leads with the human facts", () => {
    const html = render();

    expect(html).toContain("João Antônio de Assunção");
    expect(html).toContain("Certificação Solana — Turma 2026");
    expect(html).toContain("#7 de 50");
    expect(html).toContain("K7M2QX9T");
    expect(html).toContain("Certificado válido");
  });

  it("keeps addresses and hashes collapsed behind Detalhes técnicos", () => {
    const html = render();
    const details = html.slice(html.indexOf("<details"));

    expect(html).toContain("Detalhes técnicos");
    // Present in the document (it is what makes the claim checkable) but only
    // inside the disclosure, which renders closed — no `open` attribute.
    expect(details).not.toMatch(/^<details[^>]*\sopen/);
    expect(html.slice(0, html.indexOf("<details"))).not.toContain(VIEW.sha256!);
    expect(details).toContain(VIEW.sha256);
    expect(details).toContain(VIEW.address);
    expect(details).toContain(VIEW.editionAddress);
  });

  it("offers the PDF export for a claimed certificate", () => {
    expect(render()).toContain(`/api/certificates/${VIEW.address}/pdf`);
  });

  it("withholds the PDF export from a revoked certificate", () => {
    const html = render({
      ...VIEW,
      status: "Revoked",
      revokeReason: "Emitido por engano",
    });

    expect(html).not.toContain(`/api/certificates/${VIEW.address}/pdf`);
    expect(html).toContain("Emitido por engano");
  });

  it("shows the issuer block only when an issuer is configured", () => {
    expect(render()).not.toContain("Emitido por");

    process.env.ISSUER_NAME = "Superteam Brasil";
    expect(render()).toContain("Emitido por");
  });
});
