import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { VerifySignerView } from "@/lib/db/claim-verify-queries";
import { SignerTable } from "../signer-table";
import { VerifyIssuer } from "../verify-issuer";

const SIGNERS: VerifySignerView[] = [
  {
    position: 0,
    name: "Ana Ribeiro",
    role: "Coordenadora",
    wallet: "Wa" + "l".repeat(30),
    signed: true,
    txSig: "3" + "y".repeat(63),
    signedAt: "2026-08-19T10:00:00.000Z",
  },
  {
    position: 1,
    name: "Bruno Sá",
    role: "Instrutor",
    wallet: "Wb" + "l".repeat(30),
    signed: false,
    txSig: null,
    signedAt: null,
  },
];

afterEach(() => {
  delete process.env.ISSUER_NAME;
  delete process.env.ISSUER_CONTACT_URL;
  delete process.env.ISSUER_CNPJ;
});

describe("SignerTable", () => {
  it("lists people, not hashes — transactions live in the technical details", () => {
    const html = renderToStaticMarkup(
      <SignerTable signers={SIGNERS} locale="pt-BR" />,
    );

    expect(html).toContain("Ana Ribeiro");
    expect(html).toContain("Coordenadora");
    expect(html).toContain("aguardando assinatura");
    // The signature transaction and the explorer link it used to carry are gone.
    expect(html).not.toContain("3yyyyyy");
    expect(html).not.toContain("explorer.solana.com");
  });

  it("renders in the locale it is given, not the cookie's", () => {
    const html = renderToStaticMarkup(
      <SignerTable signers={SIGNERS} locale="en" />,
    );

    expect(html).toContain("Signer");
    expect(html).toContain("Signed at");
  });
});

describe("VerifyIssuer", () => {
  it("renders nothing when no issuer is configured", () => {
    expect(renderToStaticMarkup(<VerifyIssuer locale="pt-BR" />)).toBe("");
  });

  it("names the issuer and how to reach them", () => {
    process.env.ISSUER_NAME = "Superteam Brasil";
    process.env.ISSUER_CONTACT_URL = "https://superteam.fun/br";
    process.env.ISSUER_CNPJ = "00.000.000/0001-00";

    const html = renderToStaticMarkup(<VerifyIssuer locale="pt-BR" />);

    expect(html).toContain("Superteam Brasil");
    expect(html).toContain("https://superteam.fun/br");
    expect(html).toContain("00.000.000/0001-00");
    expect(html).toContain("confirme este certificado diretamente");
  });

  it("omits the optional rows it has no values for", () => {
    process.env.ISSUER_NAME = "Instituto Exemplo";

    const html = renderToStaticMarkup(<VerifyIssuer locale="pt-BR" />);

    expect(html).toContain("Instituto Exemplo");
    expect(html).not.toContain("CNPJ");
    expect(html).not.toContain("Site do emissor");
  });
});
