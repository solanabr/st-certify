import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/locales";
import {
  EMAIL_KINDS,
  renderEmail,
  type EmailKind,
  type EmailPayloads,
} from "../templates";

// One payload per kind, exhaustive by construction: the mapped type fails to
// compile the day a kind is added without a fixture here.
const PAYLOADS: { [K in EmailKind]: EmailPayloads[K] } = {
  "signer-invite": {
    signerName: "João Gonçalves",
    editionName: "Certificação — Solana Bootcamp",
    inviteUrl: "https://certify.test/invite/abc123",
  },
  "requests-pending": {
    editionName: "Certificação — Solana Bootcamp",
    count: 3,
    signUrl: "https://certify.test/sign",
  },
  "cert-ready": {
    studentName: "María Ñuñez",
    editionName: "Certificação — Solana Bootcamp",
    claimUrl: "https://certify.test/me",
  },
  "cert-rejected": {
    studentName: "María Ñuñez",
    editionName: "Certificação — Solana Bootcamp",
    reason: "Nome divergente da lista de presença.",
  },
  "cert-revoked": {
    studentName: "María Ñuñez",
    editionName: "Certificação — Solana Bootcamp",
    reason: null,
  },
  "claim-receipt": {
    studentName: "María Ñuñez",
    editionName: "Certificação — Solana Bootcamp",
    verifyUrl: "https://certify.test/verify/CERT111",
    pdfUrl: "https://certify.test/api/certificates/CERT111/pdf",
  },
  "signer-reminder": {
    editionName: "Certificação — Solana Bootcamp",
    count: 2,
    signUrl: "https://certify.test/sign",
  },
};

/**
 * Spec §14 forbidden-claims list, as matchers. "MEC" is case-sensitive with
 * word boundaries so ordinary words containing "mec" don't trip it; every
 * other entry is a phrase no honest copy would contain in any casing.
 */
const FORBIDDEN: RegExp[] = [
  /qualificada/i,
  /ICP-?Brasil/i,
  /\bMEC\b/,
  /cart[óo]rio/i,
  /f[ée] p[úu]blica/i,
  /presun[çc][ãa]o de veracidade/i,
  /firma reconhecida/i,
  /validade jur[íi]dica plena/i,
  /diploma/i,
  /imut[áa]vel/i,
  /imposs[íi]vel de falsificar/i,
  /gov\.br/i,
];

describe("renderEmail", () => {
  it("covers every kind in EmailPayloads", () => {
    expect([...EMAIL_KINDS].sort()).toEqual(Object.keys(PAYLOADS).sort());
  });

  for (const kind of EMAIL_KINDS) {
    for (const locale of LOCALES) {
      describe(`${kind} · ${locale}`, () => {
        const rendered = renderEmail(kind, locale, PAYLOADS[kind]);

        it("returns non-empty subject, html and text", () => {
          expect(rendered.subject.trim().length).toBeGreaterThan(0);
          expect(rendered.html.trim().length).toBeGreaterThan(0);
          expect(rendered.text.trim().length).toBeGreaterThan(0);
        });

        it("leaks no undefined values or unresolved placeholders", () => {
          for (const part of [rendered.subject, rendered.html, rendered.text]) {
            expect(part).not.toContain("undefined");
            expect(part).not.toContain("null");
            expect(part).not.toMatch(/\{[a-zA-Z]+\}/);
          }
        });

        it("makes no forbidden legal claim", () => {
          const corpus = `${rendered.subject}\n${rendered.html}\n${rendered.text}`;
          for (const pattern of FORBIDDEN) {
            expect(corpus).not.toMatch(pattern);
          }
        });

        it("renders an accessible html document", () => {
          expect(rendered.html).toContain("<!DOCTYPE html>");
          expect(rendered.html).toContain(`lang="${locale}"`);
          // Preheader text and a title give screen readers and inbox
          // previews something better than the first styled div.
          expect(rendered.html).toContain("<title>");
        });
      });
    }
  }

  it("escapes html-significant characters in interpolated payload values", () => {
    const rendered = renderEmail("signer-invite", "pt-BR", {
      signerName: '<script>alert("x")</script>',
      editionName: "Turma A & B",
      inviteUrl: "https://certify.test/invite/xyz",
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain("Turma A &amp; B");
    expect(rendered.text).toContain("Turma A & B");
  });

  it("puts the call-to-action url in both html and text", () => {
    const rendered = renderEmail("cert-ready", "pt-BR", PAYLOADS["cert-ready"]);
    expect(rendered.html).toContain('href="https://certify.test/me"');
    expect(rendered.text).toContain("https://certify.test/me");
  });

  it("keeps the pdf link in the claim receipt alongside the verify cta", () => {
    const rendered = renderEmail(
      "claim-receipt",
      "pt-BR",
      PAYLOADS["claim-receipt"],
    );
    expect(rendered.html).toContain(
      'href="https://certify.test/verify/CERT111"',
    );
    expect(rendered.html).toContain(
      "https://certify.test/api/certificates/CERT111/pdf",
    );
  });

  it("states a fallback when a rejection or revocation carries no reason", () => {
    const withoutReason = renderEmail("cert-revoked", "pt-BR", {
      studentName: "Ana",
      editionName: "Turma A",
      reason: null,
    });
    const withReason = renderEmail("cert-rejected", "pt-BR", {
      studentName: "Ana",
      editionName: "Turma A",
      reason: "Documento ilegível.",
    });
    expect(withoutReason.text).not.toContain("null");
    expect(withReason.text).toContain("Documento ilegível.");
  });

  it("keeps accented characters intact", () => {
    const rendered = renderEmail("signer-invite", "pt-BR", {
      signerName: "João",
      editionName: "Certificação — Turma São Paulo",
      inviteUrl: "https://certify.test/invite/abc",
    });
    expect(rendered.subject).toContain("Certificação — Turma São Paulo");
  });

  it("localizes the subject per locale", () => {
    const subjects = LOCALES.map(
      (locale) =>
        renderEmail("signer-invite", locale, PAYLOADS["signer-invite"]).subject,
    );
    expect(new Set(subjects).size).toBe(LOCALES.length);
  });
});
